require("dotenv").config();
const {SlashCommandBuilder, PermissionFlagsBits} = require("discord.js");
const Judge = require("../../mongo/Judge");
const tallyUserThreadReactions = require("../../utility/discord/reactions/tallyUserThreadReactions");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("register")
		.setDescription("Manually register a user in the judge database.")
		.addUserOption(optionBuilder => 
			optionBuilder.setName("user")
				.setDescription("The user to be registered.")
				.setRequired(true)
		)
		.addStringOption(optionBuilder => 
			optionBuilder.setName("role")
				.setDescription("The role that the user will have in the judging system.")
				.setRequired(true)
				.addChoices(
					{name: "LN", value: "nominator"},
					{name: "Admin", value: "admin"}
				)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const deferPromise = interaction.deferReply({ephemeral: true});

		const user = interaction.options.getUser("user", true);
		const userType = interaction.options.getString("role", true);

		const forumIds = [process.env.VETO_FORUM_ID];
		if(userType === "admin") forumIds.push(process.env.SUBMISSIONS_FORUM_ID);

		const tallyPromises = [];
		for(const forumId of forumIds) {
			tallyPromises.push(await fetchAndTallyUnreactedThreadIds(client, forumId, user.id));
		}
		const threadIds = (await Promise.all(tallyPromises)).flat();

		await Judge.enqueue(() => Judge.create({
			userId: user.id,
			judgeType: userType,
			unjudgedThreadIds: threadIds
		}));

		await deferPromise;
		interaction.editReply(`Successfully registered \`${user.id}\` with \`${threadIds.length}\` remaining threads tallied.`);
	}
};

async function fetchAndTallyUnreactedThreadIds(client, forumId, userId) {
	const forum = await client.channels.fetch(forumId);
	const threads = await tallyUserThreadReactions(forum, userId, ...["✅", "⛔"], false);
	return threads.map(thread => thread.id);
}