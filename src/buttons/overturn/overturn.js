require("dotenv").config();

const { ButtonBuilder, ButtonStyle, EmbedBuilder, time, TimestampStyles } = require("discord.js");
const getTagByEmojiCode = require("../../utility/discord/threads/getTagByEmojiCode");

const { Judge, Submission } = require("../../mongo/mongoModels").modelData;
const JUDGEMENT_EMOJI_CODES = process.env.JUDGEMENT_EMOJI_CODES.split(", ");

const USER_ID_REGEX = /<@(\d+)>/g;

module.exports = {
	data: new ButtonBuilder()
		.setCustomId("overturn")
		.setLabel("Overturn [NAT]")
		.setEmoji("♻️")
		.setStyle(ButtonStyle.Primary),
	async execute(interaction) {
		await interaction.deferUpdate();

		const isAssessor = await Judge.enqueue(() => Judge.exists({userId: interaction.user.id, judgeType: {$in: ["assessor", "admin"]}}).exec());
		if(!isAssessor) {
			await interaction.followUp({
				embeds: [EmbedBuilder.generateFailEmbed("You are **not eligible** to overturn Vetoes!\nThis feature is for **NATs**.")],
				ephemeral: true
			});
			console.log(`Veto Overturn Request on Thread ${interaction.channelId} Failed; User ${interaction.user.id} was not an Assessor`);
			return;
		}

		const textSegments = interaction.message.content.split("\n"); // Judging Completed - Blank - Overturn Request Label - Overturn Request Users - Blank - Link
		const overturnUserMatches = textSegments[3].matchAll(USER_ID_REGEX);
		let overturnRequests = 1; // Count number of users; initialised as 1 as the current requester has not yet been added
		for(const overturnUserMatch of overturnUserMatches) {
			overturnRequests++;

			const overturnUserId = overturnUserMatch[1];
			if(overturnUserId === interaction.user.id) {
				await interaction.followUp({
					embeds: [EmbedBuilder.generateFailEmbed("You have **already requested** to overturn this submission!")],
					ephemeral: true
				});
				console.log(`Veto Overturn Request on Thread ${interaction.channelId} Failed; User ${interaction.user.id} had already requested an overturn`);
				return;
			}
		}
		console.log(overturnRequests);
		if(overturnRequests === 3) {
			const date = new Date();
			textSegments[0] = `🥳 **Veto Overriden** on ${time(date, TimestampStyles.LongDateTime)}!`;
			textSegments.splice(1, 3); // Remove overturn request text

			const approvedTag = getTagByEmojiCode(interaction.channel.parent, JUDGEMENT_EMOJI_CODES[0]);
			
			await Promise.all([
				interaction.channel.setAppliedTags([approvedTag.id]),
				interaction.message.edit({content: textSegments.join("\n"), components: []}),
				Submission.enqueue(() => Submission.updateOne({threadId: interaction.channelId}, {status: "APPROVED"}).exec())
			]);
			console.log(`Veto Overturn Request on Thread ${interaction.channelId} Success; User ${interaction.user.id} was the Final Required Requester`);
		} else {
			if(overturnRequests !== 1) textSegments[3] += ", "; // TODO: This is pretty scuffed; it is actually 1 in the case where it was none and is about to have someone (aka, first runthrough)
			else textSegments[3] = "";
			textSegments[3] += interaction.user.toString();
			await interaction.message.edit(textSegments.join("\n"));
			console.log(`Veto Overturn Request on Thread ${interaction.channelId} Success; User ${interaction.user.id} is Requester ${overturnRequests}`);
		}
	}
}