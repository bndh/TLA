const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { Judge, Submission } = require("../../mongo/mongoModels").modelData;
const getVideosFromMessage = require("../../utility/discord/messages/getVideosFromMessage");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("random")
		.setDescription("Fetch a random submission which you have not yet judged.")
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("true-random")
			.setDescription("Whether the returned thread will be picked truly randomly. (Default: false).")
			.setRequired(false)
		)
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("preview")
			.setDescription("Whether the link to the thread should be included in the response. (Default: true).")
			.setRequired(false)
		),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});

		const trueRandom = interaction.options.getBoolean("true-random", false) ?? false;
		const preview = interaction.options.getBoolean("preview", false) ?? true;

		const judgeEntry = await Judge.enqueue(() => 
			Judge.findOne({userId: interaction.user.id})
				 .select({counselledSubmissionIds: 1, judgeType: 1, _id: 0})
		 		 .exec()
		);
		if(!judgeEntry) {
			interaction.editReply(`You are not yet \`registered\`. Contact an \`admin\` if you believe this is incorrect.`);
			return;
		}

		const counselledSubmissionIds = judgeEntry.counselledSubmissionIds;
		let permissibleStatuses;
		if(judgeEntry.judgeType === "admin") permissibleStatuses = ["AWAITING VETO", "AWAITING DECISION", "PENDING APPROVAL"];
		else permissibleStatuses = ["AWAITING VETO", "PENDING APPROVAL"]; // Nominator, assessor
		
		const aggregationPipeline = [{$match: {threadId: {$nin: counselledSubmissionIds}, status: {$in: permissibleStatuses}}}];
		aggregationPipeline.push(trueRandom ? {$sample: {size: 1}} : {$sort: {threadId: 1}});
	
		const permissibleSubmissions = await Submission.enqueue(() => Submission.aggregate(aggregationPipeline).exec());

		if(permissibleSubmissions.length === 0) {
			await interaction.editReply({embeds: [EmbedBuilder.generateSuccessEmbed("You've judged **every submission!**\nKeep up the good work!")]});
			console.info(`Command random used by ${interaction.user.id} in ${interaction.channelId}, yielding no judged submission. (All were already judged).`);
			return;
		}

		console.info(`Command random used by ${interaction.user.id} in ${interaction.channelId}, yielding ${permissibleSubmissions[0].threadId}.`)
		const thread = await interaction.client.channels.fetch(permissibleSubmissions[0].threadId);

		let responseText = "Found ";
		if(preview) {
			const starterMessage = await thread.fetchStarterMessage();
			const videoLink = getVideosFromMessage(starterMessage, false)[0];
			responseText += `**[unjudged layout](${videoLink})** `;
		} else {
			responseText += "**unjudged layout** ";
		}
		responseText += `at: ${thread.url}!`; // All threads are titled "New Submission!" (shown in the shortcut of thread.url), so no need for any closing punctuation here
		await interaction.editReply(responseText);
	}
};