require("dotenv").config();

const {EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits} = require("discord.js");

const { Judge } = require("../../mongo/mongoModels").modelData;

const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const getTagByEmojiCode = require("../../utility/discord/threads/getTagByEmojiCode");
const hasReacted = require("../../utility/discord/reactions/hasReacted");

const JUDGEMENT_EMOJI_CODES = process.env.JUDGEMENT_EMOJI_CODES.split(", ");
const vowels = ["A", "E", "I", "O", "U"];

module.exports = {
	data: new SlashCommandBuilder()
		.setName("register")
		.setDescription("Manually register a user in the judge database.")
		.addUserOption(optionBuilder => 
			optionBuilder.setName("registree")
				.setDescription("The registree.")
				.setRequired(true)
		)
		.addStringOption(optionBuilder => 
			optionBuilder.setName("judge-type")
				.setDescription("The role that the user will serve in the judging system.")
				.setRequired(true)
				.addChoices(
					{name: "LN", value: "nominator"},
					{name: "Admin", value: "admin"}
				)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});

		const registree = interaction.options.getUser("registree", true);
		const judgeType = interaction.options.getString("judge-type", true);

		console.info(`COMMAND ${this.data.name} USED BY ${interaction.user.id} IN ${interaction.channelId} WITH registree ${registree} AND judgeType ${judgeType}`);

		let forumIds;
		if(judgeType === "nominator") forumIds = [process.env.VETO_FORUM_ID];
		else forumIds = [process.env.VETO_FORUM_ID, process.env.SUBMISSIONS_FORUM_ID];
		const forums = await Promise.all(forumIds.map(forumId => interaction.client.channels.fetch(forumId)));

		const {counselledSubmissionIds, totalSubmissionsClosed} = await tallyRegistreeSubmissions(forums, registree.id);

		const documentPromise = Judge.updateOrCreate(
			{userId: registree.id},
			{$set: {judgeType: judgeType, counselledSubmissionIds: counselledSubmissionIds, totalSubmissionsClosed: totalSubmissionsClosed},
			 $unset: {snappedJudgedInterim: 1, snappedJudgedTotal: 1}},
			{userId: registree.id, judgeType: judgeType, counselledSubmissionIds: counselledSubmissionIds, totalSubmissionsClosed: totalSubmissionsClosed}
		);

		const firstCharacterCaps = judgeType.substring(0, 1).toUpperCase();
		const typeString = "a" + (vowels.includes(firstCharacterCaps) ? "n" : "") + // a/an
						   " " +
						   firstCharacterCaps + judgeType.substring(1); // judgeType capitalised
		await documentPromise;
		interaction.editReply({embeds: [EmbedBuilder.generateSuccessEmbed(`Successfully registered ${registree.toString()} as **${typeString}**!`)]});
	}
};

async function tallyRegistreeSubmissions(forums, registreeId) {
	const counselledSubmissionIds = [];
	let totalSubmissionsClosed = 0;

	const threadGroups = await Promise.all(forums.map(forum => getAllThreads(forum)));
	const tallyPromises = Array(threadGroups.reduce((accumulator, threadGroup) => accumulator + threadGroup.size, 0));
	for(let i = 0; i < threadGroups.length; i++) {
		if(threadGroups[i].size === 0) continue;
		const threadGroup = threadGroups[i];
		const closedTagIds = JUDGEMENT_EMOJI_CODES.map(emojiCode => getTagByEmojiCode(forums[i], emojiCode).id);

		for(let j = 0; j < threadGroup.size; j++) {
			tallyPromises[i] = new Promise(async resolve => {
				const thread = threadGroup.at(j);
				const starterMessage = await thread.fetchStarterMessage();
				const reacted = await hasReacted(starterMessage, registreeId, JUDGEMENT_EMOJI_CODES);

				if(reacted) {
					const threadClosed = closedTagIds.includes(thread.appliedTags[0]);
					if(threadClosed) totalSubmissionsClosed++;
					else counselledSubmissionIds.push(thread.id);
				}
				resolve();
			});
		}
	}

	await Promise.all(tallyPromises);
	return {
		counselledSubmissionIds: counselledSubmissionIds, 
		totalSubmissionsClosed: totalSubmissionsClosed
	};
}