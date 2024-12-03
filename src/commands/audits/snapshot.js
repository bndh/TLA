require("dotenv").config();

const { EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { Info, Judge } = require("../../mongo/mongoModels").modelData;
const getAllThreads = require("../../utility/discord/threads/getAllThreads");

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

		console.info(`COMMAND ${this.data.name} USED BY ${interaction.user.id} IN ${interaction.channelId} WITH overwrite ${overwrite}`);

		if(!overwrite) {
			const previousSnapshotExists = await Info.exists({id: "snapshotCreationTime"});
			if(previousSnapshotExists) {
				interaction.editReply({embeds: [
					EmbedBuilder.generateFailEmbed("A snapshot **already exists**! Did **not record** data in accordance with the _**Overwrite**_ property.")
				]});
				return;
			}
		}

		await snapshot(interaction.client);
		interaction.editReply({embeds: [
			EmbedBuilder.generateSuccessEmbed("Took a **snapshot** of the **current system state**.")
		]});
	},
	snapshot // Used externally
};

function snapshot(client) {
	return Promise.all([
		snapshotJudges(),
		updateSubmissionCountInfo(client),
		Info.updateOrCreate({id: "snapshotCreationTime"}, {data: Date.now()})
	]);
}

async function snapshotJudges() {
	const judgeDocuments = await Judge.enqueue(() => Judge.find({}).exec());

	const savePromises = Array(judgeDocuments.length);
	for(let i = 0; i < judgeDocuments.length; i++) {
		savePromises[i] = new Promise(async (resolve) => {
			const judgeDocument = judgeDocuments[i];
			const currentJudgedTotal = judgeDocument.counselledSubmissionIds.length + judgeDocument.totalSubmissionsClosed;

			if(judgeDocument.snappedJudgedTotal) judgeDocument.snappedJudgedInterim = currentJudgedTotal - judgeDocument.snappedJudgedTotal; // If the document had been previously snapped, we must subtract the total at the time of that snapshot to get the number judged in the interim
			else judgeDocument.snappedJudgedInterim = currentJudgedTotal; // If no previous snapshot is present, this will suffice

			judgeDocument.snappedJudgedTotal = currentJudgedTotal;

			if(judgeDocument.snappedJudgedInterim >= 0) {
				await Judge.enqueue(() => judgeDocument.save());
			} else {
				console.error(`User ${judgeDocument.userId} has invalid snappedJudgedInterim at ${judgeDocument.snappedJudgedInterim}, not saving.`);
			}
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
			await Info.updateOrCreate({id: totalSubmissionInfoIds[i]}, {data: threads.size});
			resolve();
		});
	}
	await Promise.all(countPromises);
}