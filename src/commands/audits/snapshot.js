require("dotenv").config();

const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const Judge = require("../../mongo/Judge");
const Info = require("../../mongo/Info");
const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const updateOrCreate = require("../../mongo/utility/updateOrCreate");

// TODO further investigate Client
module.exports = {
	data: new SlashCommandBuilder()
		.setName("snapshot")
		.setDescription("Overwrite the previous audit data with the current system state.")
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("overwrite")
			.setDescription("If false, a snapshot will only be taken if no previous audit data is present. (Default: false).")
			.setRequired(false)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});
		
		const overwrite = interaction.options.getBoolean("overwrite", false) ?? false;
		if(!overwrite) {
			const previousSnapshotExists = await Info.exists({id: "snapshotCreationTime"});
			if(previousSnapshotExists) {
				interaction.editReply({embeds: [new EmbedBuilder()
					.setDescription("A snapshot **already exists**! Did **not record** data in accordance with the _**Overwrite**_ property.")
					.setAuthor({name: "TLA Admin Team", iconURL: process.env.EXTREME_DEMON_URL, url: "https://www.youtube.com/@bndh4409"})
					.setColor(process.env.FAIL_COLOR)]});
				return;
			}
		}

		await snapshot(interaction.client);
		interaction.editReply({embeds: [new EmbedBuilder()
			.setDescription("Took a **snapshot** of the **current system state**.")
			.setAuthor({name: "TLA Admin Team", iconURL: process.env.NORMAL_URL, url: "https://www.youtube.com/@bndh4409"})
			.setColor(process.env.SUCCESS_COLOR)]});
	},
	snapshot // Used externally
};

function snapshot(client) {
	return Promise.all([
		snapshotJudges(),
		updateSubmissionCountInfo(client),
		updateOrCreate(
			Info,
			{id: "snapshotCreationTime"},
			{data: Date.now()},
			{id: "snapshotCreationTime", data: Date.now()},
			false
		)
	]);
}

async function snapshotJudges() {
	const judgeDocuments = await Judge.enqueue(() => Judge.find({}).exec());

	const savePromises = Array(judgeDocuments.length);
	for(let i = 0; i < judgeDocuments.length; i++) {
		savePromises[i] = new Promise(async (resolve) => {
			const judgeDocument = judgeDocuments[i];
			const currentJudgedTotal = judgeDocument.counselledSubmissionIds.length + judgeDocument.totalSubmissionsClosed;
	
			judgeDocument.snappedJudgedInterim = currentJudgedTotal; // If no previous snapshot is present, this will suffice
			if(judgeDocument.snappedJudgedTotal) judgeDocument.snappedJudgedInterim -= judgeDocument.snappedJudgedTotal; // If the document had been previously snapped, we must subtract the total at the time of that snapshot to get the number judged in the interim
		
			judgeDocument.snappedJudgedTotal = currentJudgedTotal;

			await Judge.enqueue(() => judgeDocument.save());
			resolve();
		});
	}
	await Promise.all(savePromises);
}

const totalSubmissionInfoIds = ["snappedSubmissionsCount", "snappedVetoCount"];
async function updateSubmissionCountInfo(client) {
	const forums = await Promise.all([
		client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID),
		client.channels.fetch(process.env.VETO_FORUM_ID)
	]);

	const countPromises = Array(forums.length);
	for(let i = 0; i < forums.length; i++) {
		countPromises[i] = new Promise(async (resolve) => {
			const threads = await getAllThreads(forums[i]);
			await updateOrCreate(
				Info,
				{id: totalSubmissionInfoIds[i]},
				{data: threads.size},
				{id: totalSubmissionInfoIds[i], data: threads.size},
				false
			);
			resolve();
		});
	}
	await Promise.all(countPromises);
}