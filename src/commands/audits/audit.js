require("dotenv").config();

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const Info = require("../../mongo/Info");
const Judge = require("../../mongo/Judge");
const getAllThreads = require("../../utility/discord/threads/getAllThreads");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("audit")
		.setDescription("Manually perform an audit, displaying the contributions that each judge has made")
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("overwrite-snapshot")
			.setDescription("Whether or not to overwrite the last system state snapshot. (Default: false).")
			.setRequired(false)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		// Total number of snapshot submissions
		// Total number of current submissions
		// Judge no. left then
		// Judge no. left now

		const deferPromise = interaction.deferReply();

		const overwrite = interaction.options.getBoolean("overwrite-snapshot", false) ?? false;
		
		const snapshotCountPromises = await Promise.all([ // TODO could miss on first run
			Info.findOne({id: "snapshotSubmissionThreadCount"}).select({data: 1, _id: 0}).exec(),
			Info.findOne({id: "snapshotVetoThreadCount"}).select({data: 1, _id: 0}).exec()
		]); // Old counts
	
		const forums = await Promise.all([
			interaction.client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID),
			interaction.client.channels.fetch(process.env.VETO_FORUM_ID)
		]);
		const threads = await Promise.all([
			forums.map(forum => getAllThreads(forum))
		]); // Get new counts
	
		const submissionCountDifference = threads[0].length - snapshotCountPromises[0];
		const vetoCountDifference = threads[1].length - snapshotCountPromises[1];

		const countDifferences = [submissionCountDifference, vetoCountDifference];

		const judges = Judge.enqueue(() => Judge.find({}).exec());
		const judgePromises = [judges.length];
		for(let i = 0; i < judges.length; i++) { // Change of judge type????? TODO
			judgePromises[i] = new Promise(async (resolve) => {
				const judgeEntry = judges[i];
				const auditEntry = {};
				
				if(!auditEntry) { // New Judge
					const unjudgedCount = judgeEntry.judgeType === "admin" ? threads[0].length + threads[1].length : threads[1].length;
					const numJudged = Math.abs(judgeEntry.unjudgedThreadIds.length - unjudgedCount);
					const judgedPercentage = numJudged / unjudgedCount;
					resolve(`New Judge! Judge Type ${judgeEntry.judgeType}. ${numJudged} judged. Judged ${judgedPercentage}% of all visible submissions.`);
				}

				const threadDifference = judgeEntry.judgeType === "admin" ? countDifferences[0] + countDifferences[1] : countDifferences[1]; // Both forums for admins
	
				const unjudgedDifference = judgeEntry.unjudgedThreadIds.length - auditEntry.unjudgedThreadCount;
				const numJudged = threadDifference - unjudgedDifference;
				const judgedPercentage = numJudged / threadDifference;
				resolve(`Judge Type ${judgeEntry.judgeType}. ${numJudged} judged. Judged ${judgedPercentage}% of ${threadDifference} new visible submissions.`);
			});
		}
	}
}

async function getCountDifferences(interaction) {
	
}