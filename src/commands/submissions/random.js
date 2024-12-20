const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { Judge, Submission } = require("../../mongo/mongoModels").modelData;
const getVideosFromMessage = require("../../utility/discord/messages/getVideosFromMessage");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("random")
		.setDescription("Fetch a random submission which you have not yet judged.")
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("preview")
			.setDescription("Whether the link to the thread should be included in the response. (Default: true).")
			.setRequired(false)
		),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});

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
		
		const permissibleSubmissions = await Submission.enqueue(() => // While we could just return the first result, we pick one randomly so that if a judge was stuck with a submission, they should be able to have the command generate a different one in a few tries 
			Submission.aggregate([
				{$match: {threadId: {$nin: counselledSubmissionIds}, status: {$in: permissibleStatuses}}},
				{$sample: {size: 1}} // Picks random submission
			]).exec()
		);
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