require("dotenv").config();

const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRow, ActionRowBuilder } = require("discord.js");
const getTagByEmojiCode = require("../utility/discord/threads/getTagByEmojiCode");
const TextFormatter = require("../utility/TextFormatter");

const openButton = require("../buttons/report/open").data;
const pinButton = require("../buttons/report/pin").data;
const closeButton = require("../buttons/report/close").data;

module.exports = { // TODO check what happens if two people do the same thing at once
	customId: "report",
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});

		const guildPromise = interaction.client.guilds.fetch(process.env.GUILD_ID);
		const reportForumPromise = interaction.client.channels.fetch(process.env.REPORT_FORUM_ID);

		const subject = interaction.fields.getTextInputValue("subject");
		const description = interaction.fields.getTextInputValue("description");
		const category = interaction.subId;

		const displayedName = await getNicknameOrBackup(interaction.user.id, await guildPromise, interaction.user.displayName);
		const avatarUrl = `https://cdn.discordapp.com/avatars/${interaction.user.id}/${interaction.user.avatar}.jpeg`;

		const reportForum = await reportForumPromise;
		await createReportThread(reportForum, subject, category, description, displayedName, avatarUrl);

		await interaction.editReply({embeds: [
			EmbedBuilder.generateSuccessEmbed("Your report was **submitted** and will be **taken into consideration**!\n**Thank you** for taking the time to fill out a report.")
		]});
	}
}

async function getNicknameOrBackup(userId, guild, backup) {
	let name;
	try {
		const member = await guild.members.fetch(userId);
		name = member.nickname;
		if(!name) throw new Error();
	} catch(notFound) { // Member does not exist
		name = backup;
	}
	return name;
}

async function createReportThread(reportForum, subject, category, description, displayedName, avatarUrl) {
	const categoryTag = reportForum.availableTags.find(tag => tag.name.toLowerCase() === category);
	console.log(category);
	const openTag = getTagByEmojiCode(reportForum, "♻️");

	await reportForum.threads.create({
		appliedTags: [openTag.id, categoryTag.id],
		message: {
			embeds: [generateReportEmbed(subject, category, description, displayedName, avatarUrl)],
			components: [new ActionRowBuilder().setComponents(openButton, pinButton, closeButton)]
		},
		name: TextFormatter.abbreviate(`${subject} (${displayedName})`, 100)
	});
}

function generateReportEmbed(subject, category, description, displayedName, avatarUrl) {
	const reportEmbed = new EmbedBuilder()
		.setTitle(subject)
		.setDescription(description)
		.setAuthor({name: displayedName, iconURL: avatarUrl})

	if(category === "issue") reportEmbed.setColor(process.env.FAIL_COLOR);
	else if(category === "suggestion") reportEmbed.setColor(process.env.SUCCESS_COLOR);
	else reportEmbed.setColor(process.env.NEUTRAL_COLOR);

	return reportEmbed;
}