const {SlashCommandBuilder, PermissionFlagsBits} = require("discord.js");
const LayoutAdmin = require("../../mongo/layoutAdmin");
const layoutNominator = require("../../mongo/layoutNominator");

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
					{name: "LN", value: "layoutNominator"},
					{name: "Admin", value: "layoutAdmin"}
				)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const user = interaction.options.getUser("user", true);
		const userType = interaction.options.getString("role", true);
		if(userType === "admin") handleNewAdmin(interaction.client, user.id);
		else handleNewNominator(interaction.client, user.id);
	}
}

async function handleNewAdmin(client, userId) {
	const admin = new LayoutAdmin({userId: userId, unjudgedLayoutSubmissionIds: []});
	await admin.save();
}

async function handleNewNominator(client, userId) {
	const nominator = new layoutNominator({userId: userId, unjudgedLayoutVetoIds: []});
	await nominator.save();
}

async function checkUserThreads(targetForum, userId) {
	const threadIds = [];
	
	const fetchedActiveThreads = await targetForum.threads.fetchActive();
	fetchedActiveThreads.threads.each(async thread => {
		const reacted = await hasReacted(thread, userId);
		if(reacted) threadIds.push(thread.id);
	});
	const fetchedArchivedThreads = await targetForum.threads.fetchArchived();
	fetchedArchivedThreads.threads.each(async thread => {
		const reacted = await hasReacted(thread, userId);
		if(reacted) threadIds.push(thread.id);
	});
}

async function hasReacted(thread, userId) {
	const starterMessage = await thread.fetchStarterMessage();
	const users = starterMessage.reactions.resolve("✅").users;
	const fetchedUsers = await users.fetch({after: userId});
	const hasReacted = fetchedUsers.findKey(reactionUserId => reactionUserId === userId);
	return hasReacted;
}