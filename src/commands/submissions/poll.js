require("dotenv").config();
const {SlashCommandBuilder, PermissionFlagsBits} = require("discord.js");
const {Worker} = require("worker_threads");
const path = require("path");
const fetchMessages = require("../../utility/discord/fetchMessages");
const createValidatedReactedVideoThreads = require("../../utility/discord/createValidatedReactedVideoThreads");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("poll")
		.setDescription("Takes every link from #submissions-intake and reposts it in the submissions forum.")
		.addIntegerOption(optionBuilder => 
			optionBuilder.setName("max-poll")
				.setDescription("The maximum number of messages to be scanned from #submissions-intake.")
				.setMinValue(1)
				.setRequired(true)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});

		const intakePromise = interaction.client.channels.fetch(process.env.SUBMISSIONS_INTAKE_ID);
		const submissionsPromise = interaction.client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID);
		const maxPoll = interaction.options.getInteger("max-poll");
	
		const channels = await Promise.all([intakePromise, submissionsPromise]);
		const messages = await fetchMessages(channels[0], maxPoll);

		let videoLinks = [];
		const processedLinkPromises = [];

		messages.forEach(message => {
			const attachments = [];
			message.attachments.forEach(attachment => attachments.push(attachment)); // Attachments is a collection so we convert to an array first

			const worker = new Worker(
				path.join(__dirname, "helpers", "pollWorker.js"),
				{workerData: {cleanContent: message.cleanContent, attachments: attachments}}
			);

			const processedLinksPromise = new Promise(resolve => {
				worker.once("message", workerVideoLinks => {
					videoLinks = videoLinks.concat(workerVideoLinks);
					resolve();
				});
			});
			processedLinkPromises.push(processedLinksPromise);
		})
		await Promise.all(processedLinkPromises); // Indicates videoLinks is ready	

		createValidatedReactedVideoThreads(videoLinks, channels[1]);

		interaction.editReply(`Processed ${messages.length} messages.`);
	}
};