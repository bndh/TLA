require("dotenv").config();
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const sendIndefiniteTyping = require("../../utility/discord/messages/sendIndefiniteTyping");
const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const getTagsFromEmojiCodes = require("../../utility/discord/threads/getTagsFromEmojiCodes");
const getTagByEmojiCode = require("../../utility/discord/threads/getTagByEmojiCode");
const linkRegex = require("../../utility/linkRegex");
const { Submission } = require("../../mongo/mongoModels").modelData;

const JUDGEMENT_EMOJI_CODES = process.env.JUDGEMENT_EMOJI_CODES.split(", ");
const OPEN_EMOJI_CODES = process.env.OPEN_EMOJI_CODES.split(", ");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("reset")
		.setDescription("Reset all closed and pending veto threads to Awaiting Veto.")
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		// Declare initiation
		await interaction.reply({
			embeds: [EmbedBuilder.generateNeutralEmbed("**Resetting** all **pending/closed** threads!\nThis may **take a while**...")],
			ephemeral: true
		});
		const typingFlag = sendIndefiniteTyping(interaction.channel);

		// Process
		const vetoForum = await interaction.client.channels.fetch(process.env.VETO_FORUM_ID);
		
		const [waitingTagId, pendingTagId] = getTagsFromEmojiCodes(vetoForum, OPEN_EMOJI_CODES, true).map(tag => tag.id);
		
		const threads = await getAllThreads(vetoForum, true);
		await Promise.all(threads.map(thread => new Promise(async resolve => {
			if(!thread.appliedTags.some(tagId => tagId === waitingTagId)) { // Pending, open, or closed
				const videoMessage = await thread.fetchStarterMessage({force: true});
				const videoLink = videoMessage.content.match(linkRegex)[0];

				const doc = await Submission.enqueue(() => Submission.findOne({threadId: thread.id}).exec());
				doc.status = "AWAITING VETO";
				if(thread.appliedTags.includes(pendingTagId)) doc.expirationTime = undefined;

				await Promise.all([
					videoMessage.edit(videoLink),
					thread.setAppliedTags([waitingTagId]),
					Submission.enqueue(() => doc.save())
				]);
			}
			resolve();
		})))

		// Declare completion
		typingFlag.value = false;
		await interaction.followUp({  // Must use followUp because the typing notification only stops when a message is sent
			embeds: [EmbedBuilder.generateSuccessEmbed(`**Reset** all threads!`)],
			ephemeral: true
		});
	}
}