require("dotenv").config();

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const Judge = require("../../mongo/Judge");
const Info = require("../../mongo/Info");

const updateOrCreate = require("../../mongo/utility/updateOrCreate");
const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const filterUnjudgedThreads = require("../../utility/discord/threads/filterUnjudgedThreads");

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
			const previousSnapshotEvidence = await Judge.enqueue(() => Judge.exists({threadsJudgedInInterval: {$exists: true}}));
			if(previousSnapshotEvidence) { // Lossless failure state: snapshot information already exists
				await deferPromise;
				interaction.editReply("Previous \`audit already exists\`! Did not overwrite due to lossless being set to \`True\`.");
				return;
			}
		}

		const forums = await Promise.all([
			interaction.client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID),
			interaction.client.channels.fetch(process.env.VETO_FORUM_ID)
		]);
		const threadGroups = await Promise.all(forums.map(async (forum) => getAllThreads(forum)));
		const unjudgedThreadGroups = await Promise.all(threadGroups.map(async (threads) => filterUnjudgedThreads(threads)));
		
		const totalThreadCounts = threadGroups.map(threads => threads.size);
		const unjudgedThreadCounts = unjudgedThreadGroups.map(threads => threads.size);
1
		await findAndSaveIntervalCounts(...unjudgedThreadCounts, ...totalThreadCounts); // Updates judges
		await findAndSaveUnjudgedThreadCounts(unjudgedThreadCounts);
		await saveSnapshotTime(Date.now());

		await deferPromise;
		interaction.editReply("Took a \`snapshot\` of the current system state.");
	}
}

async function findAndSaveIntervalCounts(totalSubmissionCount, totalVetoCount, currentSubmissionCount, currentVetoCount) {
	const fetchValues = await Promise.all([
		Judge.enqueue(() => Judge.find({})),
		Info.findOne({id: "activeSubmissionCountSnapshot"}).exec(),
		Info.findOne({id: "activeVetoCountSnapshot"}).exec(),
	]);
	const judgeEntries = fetchValues[0];
	const snapshotSubmissionCount = fetchValues[1].data;
	const snapshotVetoCount = fetchValues[2].data;

	console.log(`Current Submission Count: ${currentSubmissionCount}`);
	console.log(`Current Veto Count: ${currentVetoCount}`);
	console.log(`Snapshot Submission Count: ${snapshotSubmissionCount}`);
	console.log(`Snapshot Veto Count: ${snapshotVetoCount}`);
	console.log(`Total Submission Count: ${totalSubmissionCount}`);
	console.log(`Total Veto Count: ${totalVetoCount}`);

	const intervalCountPromises = [judgeEntries.length];
	for(let i = 0; i < judgeEntries.length; i++) {
		judgeEntries[i].snapshotTotalUnjudged = judgeEntries[i].unjudgedThreadIds.length;
		judgeEntries[i].snapshotIntervalJudged = getJudgedInIntervalCount(
			judgeEntries[i],
			currentSubmissionCount, currentVetoCount,
			snapshotSubmissionCount, snapshotVetoCount,
			totalSubmissionCount, totalVetoCount
		);
		intervalCountPromises[i] = Judge.enqueue(() => judgeEntries[i].save());
	}
	await intervalCountPromises;
}

const threadCountIds = [ // Used for ease of iteration in subsequent method
	"activeSubmissionCountSnapshot",
	"activeVetoCountSnapshot"
];
async function findAndSaveUnjudgedThreadCounts(unjudgedThreadCounts) {
	const savePromises = [threadCountIds.length];
	for(let i = 0; i < threadCountIds.length; i++) {
		savePromises[i] = updateOrCreate(
			Info,
			{id: threadCountIds[i]},
			{data: unjudgedThreadCounts[i]},
			{id: threadCountIds[i], data: unjudgedThreadCounts[i]}
		);
	}
	await Promise.all(savePromises);
}

async function saveSnapshotTime(snapshotTime) {
	await updateOrCreate(
		Info,
		{id: "snapshotCreationTime"},
		{data: snapshotTime},
		{id: "snapshotCreationTime", data: snapshotTime}
	)
}

function getJudgedInIntervalCount(judgeEntry, currentSubmissionThreadCount, currentVetoThreadCount, previousSubmissionThreadCount, previousVetoThreadCount, totalSubmissionThreadCount, totalVetoThreadCount) {
	let threadsJudgedInInterval; // Number of threads judged since last snapshot
	
	const currentUnjudgedThreadCount = judgeEntry.unjudgedThreadIds.length;

	if(judgeEntry.snapshotTotalUnjudged) { // Indicates the previous number of judged threads
		const currentRelevantThreadCount = judgeEntry.judgeType === "admin" ? currentSubmissionThreadCount + currentVetoThreadCount : currentVetoThreadCount;

		const previousUnjudgedThreadCount = judgeEntry.snapshotTotalUnjudged; // Number of threads that the judge has not yet judged
		const remainingThreadDifference = currentUnjudgedThreadCount - previousUnjudgedThreadCount;

		const previousRelevantThreadCount = judgeEntry.judgeType === "admin" ? previousSubmissionThreadCount + previousVetoThreadCount : previousVetoThreadCount; // Number of threads that the judge type has been tasked with judging
		const relevantThreadDifference = currentRelevantThreadCount - previousRelevantThreadCount;

		threadsJudgedInInterval = relevantThreadDifference - remainingThreadDifference;
	} else { // A new judge; judge did not exist during previous snapshot (or data has somehow been lost)
		const totalRelevantThreadCount = judgeEntry.judgeType === "admin" ? totalSubmissionThreadCount + totalVetoThreadCount : totalVetoThreadCount;
		threadsJudgedInInterval = totalRelevantThreadCount - currentUnjudgedThreadCount;
	}

	console.log(`ThreadsJudgedInInterval: ${threadsJudgedInInterval}`);

	return threadsJudgedInInterval;
}