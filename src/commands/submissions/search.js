require("dotenv").config();

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

const { Submission } = require("../../mongo/mongoModels").modelData;

module.exports = {
	data: new SlashCommandBuilder()
		.setName("search")
		.setDescription("Search for a submission.")
		.addStringOption(optionBuilder => 
			optionBuilder.setName("query")
				.setDescription("A query to filter submissions against.")
				.setRequired(true))
		.addBooleanOption(optionBuilder =>
			optionBuilder.setName("visible")
				.setDescription("Whether to make the response publicly visible or not. (Default: false).")
				.setRequired(false)),
	async execute(interaction) {
		const visible = interaction.options.getBoolean("visible", false) ?? false;
		await interaction.deferReply({ephemeral: !visible});

		const query = interaction.options.getString("query", true);
		const queryRegex = new RegExp(query, "ig");
		const submissionDocs = await Submission.enqueue(() => Submission.find(
			{$or: [
				{videoLink: {$regex: queryRegex}}, 
				{videoTitle: {$regex: queryRegex}}
			]}
		).exec());

		if(submissionDocs.length === 0) {
			await interaction.editReply({embeds: [
				EmbedBuilder.generateFailEmbed("Could **not find** any submissions which **matched your query**!\nIf you believe this is **incorrect**, please contact _**@gamingpharoah**_.")
			]});
			return;
		}

		await interaction.editReply({embeds: [EmbedBuilder.generateSuccessEmbed(
			await generateFoundText(submissionDocs, interaction.client, query))
		]});
	}
};

const VETO_STATUSES = new Set(["AWAITING VETO", "PENDING APPROVAL", "APPROVED", "VETOED"]);
async function generateFoundText(submissionDocs, client, query) {
	const forums = await Promise.all([
		client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID), 
		client.channels.fetch(process.env.VETO_FORUM_ID)
	]);

	let oldLength = undefined;
	if(submissionDocs.length > 10) {
		oldLength = submissionDocs.length;
		submissionDocs = submissionDocs.slice(0, 10);
	}

	const videoData = await Promise.all(
		submissionDocs.map(async submissionDoc => {
		let submissionTitle = submissionDoc.videoTitle ?? "Unknown Title";

		const forum = VETO_STATUSES.has(submissionDoc.status) ? forums[1] : forums[0];
		const thread = await forum.threads.fetch(submissionDoc.threadId);

		return {video: submissionDoc.videoLink, title: submissionTitle, url: thread.url};
	}));

	let foundText = `All of **the following submissions** matched your **query** (_${query}_):\n`;
	videoData.forEach(data => foundText += `\n- [${data.title}](${data.video}) ➡️ ${data.url}`);
	if(oldLength) foundText += `\n\n- _and ${oldLength - 10} more..._`
	return foundText;
}