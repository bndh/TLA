require("dotenv").config();
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const Judge = require("../../mongo/Judge");
const getAllThreads = require("../../utility/discord/getAllThreads");
const hasReacted = require("../../utility/discord/hasReacted");
const getReactedUsers = require("../../utility/discord/getReactedUsers");
const getTagByEmojiCode = require("../../utility/discord/getTagByEmojiCode");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("sync")
		.setDescription("Sync the bot up with the current server state.")
		.addStringOption(optionBuilder => 
			optionBuilder.setName("mode")
				.setDescription("Which parts of the server should be synced.")
				.setRequired(true)
				.addChoices(
					{name: "Judges", value: "judges"},
					{name: "Intake", value: "intake"},
					{name: "Veto", value: "veto"},
					{name: "All", value: "all"}
				)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const deferPromise = interaction.deferReply({ephemeral: true});
	
		const mode = interaction.options.getString("mode", true);
		
		let processPromises;
		switch(mode) { // TODO MY NOTATION IS WRONG HERE IS CALLING MULTIPLE THINGS
			case("judges"): processPromises = [await handleJudgeSync(interaction)]; break;
			case("intake"): processPromises = [await handleIntakeSync(interaction)]; break;
			case("veto"): processPromises = [await handleVetoSync(interaction)]; break;
			case("all"): processPromises = [await handleJudgeSync(interaction), await handleIntakeSync(interaction), await handleVetoSync(interaction)];
		}

		await Promise.all(processPromises);
		await deferPromise;
		interaction.editReply("Sync complete!");
	}
};

async function handleJudgeSync(interaction) {
	const judgeSyncPromises = [2];

	const vetoForum = await interaction.client.channels.fetch(process.env.VETO_FORUM_ID);
	judgeSyncPromises[0] = await updateJudges("nominator", [vetoForum]);

	const submissionsForum = await interaction.client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID)
	judgeSyncPromises[1] = await updateJudges("admin", [vetoForum, submissionsForum])

	await Promise.all(judgeSyncPromises);
}

async function handleIntakeSync() {

}

async function handleVetoSync() {

}

const judgedTagCodes = ["✅", "⛔"];
async function updateJudges(judgeType, forums) {
	const judgeMap = new Map();
	const judges = await Judge.enqueue(() => Judge.find({judgeType: judgeType}).select({userId: 1, _id: 0}));

	for(const judge of judges) {
		judgeMap.set(judge.userId, []);
	}

	for(const forum of forums) {
		const judgedTagIds = [
			getTagByEmojiCode(forum.availableTags, judgedTagCodes[0]).id,
			getTagByEmojiCode(forum.availableTags, judgedTagCodes[1]).id
		];

		const initialThreads = await getAllThreads(forum);
		for(const initialThread of initialThreads.values()) {
			const fetchedThread = await forum.threads.fetch(initialThread);
			if(!fetchedThread) continue;
			if(fetchedThread.appliedTags.some((appliedTag => judgedTagIds.includes(appliedTag)))) continue;

			const starterMessage = await fetchedThread.fetchStarterMessage({cache: false});
			const reactedUserIds = await getReactedUsers(starterMessage, ...judgedTagCodes);

			for(const judgeId of judgeMap.keys()) {
				if(reactedUserIds.includes(judgeId)) continue;
				judgeMap.get(judgeId).push(fetchedThread.id);
				
			}
		}
	}

	for(const judgeId of judgeMap.keys()) {
		Judge.enqueue(() => Judge.updateOne({userId: judgeId}, {unjudgedThreadIds: judgeMap.get(judgeId)}));
	}
}