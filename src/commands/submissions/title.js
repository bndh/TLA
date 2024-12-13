require("dotenv").config();
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const getVideoTitle = require("../../utility/getVideoTitle");
const linkRegex = require("../../utility/linkRegex");
const sendIndefiniteTyping = require("../../utility/discord/messages/sendIndefiniteTyping");

const { Submission } = require("../../mongo/mongoModels").modelData;

module.exports = {
	data: new SlashCommandBuilder()
		.setName("title")
		.setDescription("Update all threads to have their appropriate YouTube titles")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.reply({
			embeds: [EmbedBuilder.generateNeutralEmbed("**Titling** all threads!\nThis may **take a while**...")],
			ephemeral: true
		});
		const typingFlag = sendIndefiniteTyping(interaction.channel);

		await Promise.all([process.env.SUBMISSIONS_FORUM_ID, process.env.VETO_FORUM_ID].map(channelId => new Promise(async resolve => {
			const channel = await interaction.client.channels.fetch(channelId);
			const threads = await getAllThreads(channel, true);
			await Promise.all(threads.map(thread => titleThreadAndDoc(thread)));
			resolve();
		})));
		
		typingFlag.value = false;
		await interaction.followUp({  // Must use followUp because the typing notification only stops when a message is sent
			embeds: [EmbedBuilder.generateSuccessEmbed(`**Titled** all threads!`)],
			ephemeral: true
		});
	}
}

async function titleThreadAndDoc(thread) {
	const videoMessage = await thread.fetchStarterMessage({force: true});
	const videoLink = videoMessage.content.match(linkRegex)[0]; // There always should be a match
	const videoTitle = await getVideoTitle(videoLink);
	if(!videoTitle) return;

	return Promise.all([
		Submission.enqueue(() => Submission.updateOne({threadId: thread.id}, {videoTitle: videoTitle})),
		thread.setName(videoTitle)
	]);
}