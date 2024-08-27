require("dotenv").config();

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const Audit = require("../../mongo/Audit");
const Judge = require("../../mongo/Judge");
const Info = require("../../mongo/Info");

const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const updateOrCreate = require("../../mongo/utility/updateOrCreate");

const threadCountIds = [
	"snapshotSubmissionThreadCount",
	"snapshotVetoThreadCount"
];

module.exports = {
	data: new SlashCommandBuilder()
		.setName("snapshot")
		.setDescription("Overwrite the previous audit data with the current system state.")
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("lossless")
			.setDescription("If true, a snapshot will only be taken if no previous audit data is present. (Default: true).")
			.setRequired(false)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const deferPromise = interaction.deferReply({ephemeral: true});
		
		const lossless = interaction.options.getBoolean("lossless", false) ?? false;
		if(lossless) {
			const auditEntries = await Audit.find({}).exec();
			if(auditEntries.length != 0) { // Lossless failure state: audit information already exists
				await deferPromise;
				interaction.editReply("Previous \`audit already exists\`! Did not overwrite due to lossless being set to \`True\`.");
				return;
			}
		}

		const snapshotTime = Date.now();
		await Promise.all([
			getAndSaveThreadCounts(interaction),
			getAndSaveAuditData(),
			updateOrCreate(
				Info,
				{id: "snapshotCreationTime"},
				{data: snapshotTime},
				{id: "snapshotCreationTime", data: snapshotTime}
			),
		]);

		await deferPromise;
		interaction.editReply("Took a \`snapshot\` of the current system state.");
	}
}

async function getAndSaveAuditData() {
	const judgeEntries = await Judge.enqueue(() => Judge.find({}));
	
	const auditData = [judgeEntries.length];
	for(let i = 0; i < judgeEntries.length; i++) {
		const judgeEntry = judgeEntries[i];
		auditData[i] = {
			userId: judgeEntry.userId,
			judgeType: judgeEntry.judgeType,
			unjudgedThreadCount: judgeEntry.unjudgedThreadIds.length
		};
	}

	const updatePromises = [auditData.length];
	for(let i = 0; i < auditData.length; i++) {
		const judgeEntry = auditData[i];
		updatePromises[i] = updateOrCreate(
			Audit,
			{userId: judgeEntry.userId, judgeType: judgeEntry.judgeType},
			{unjudgedThreadCount: judgeEntry.unjudgedThreadCount},
			judgeEntry
		);
	}
	await updatePromises;
	await Audit.deleteMany({userId: {$nin: auditData.map(datum => datum.userId)}});
}

async function getAndSaveThreadCounts(interaction) {
	const forums = await Promise.all([
		interaction.client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID),
		interaction.client.channels.fetch(process.env.VETO_FORUM_ID)
	]);

	const threadFetchPromises = await Promise.all(
		forums.map(async (forum) => getAllThreads(forum))
	);

	const savePromises = [threadCountIds].length;
	for(let i = 0; i < threadCountIds; i++) {
		savePromises[i] = updateOrCreate(
			Info,
			{id: threadCountIds[i]},
			{data: threadFetchPromises[i].length},
			{id: threadCountsIds[i], data: threadFetchPromises[0].length}
		);
	}
	await savePromises;
}