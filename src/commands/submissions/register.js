require("dotenv").config();
const {SlashCommandBuilder, PermissionFlagsBits} = require("discord.js");

const Judge = require("../../mongo/Judge");
const Submission = require("../../mongo/Submission");

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
		const deferPromise = interaction.deferReply({ephemeral: true});

		const registree = interaction.options.getUser("registree", true);
		const judgeType = interaction.options.getString("judge-type", true);

		let forumStatuses; // The statuses corresponding with the submissions the judge should judge
		if(judgeType === "nominator") forumStatuses = ["AWAITING VETO", "PENDING APPROVAL"];
		else forumStatuses = ["AWAITING DECISION", "AWAITING VETO", "PENDING APPROVAL"];
		
		const threadEntries = await Submission.enqueue(() => 
			Submission.find({status: {$in: forumStatuses}})
					  .select({threadId: 1, _id: 0})
					  .exec()
		);
		const threadIds = threadEntries.map(threadEntry => threadEntry.threadId);

		// Saving to DB
		const existingEntry = await Judge.enqueue(() => Judge.findOne({userId: registree.id}).exec());
		if(!existingEntry) {
			await Judge.enqueue(() => Judge.create({
				userId: registree.id,
				judgeType: judgeType,
				unjudgedThreadIds: threadIds
			}));
		} else { // Update existing entry
			existingEntry.judgeType = judgeType;
			existingEntry.unjudgedThreadIds = threadIds;
			await Judge.enqueue(() => existingEntry.save());
		}

		await deferPromise;
		interaction.editReply(`Successfully registered ${registree.toString()}, having appointed \`${threadIds.length}\` submission${threadIds.length === 1 ? "" : "s"}.`);
	}
};