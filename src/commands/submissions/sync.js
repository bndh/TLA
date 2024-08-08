require("dotenv").config();
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const Judge = require("../../mongo/Judge");
const Submission = require("../../mongo/Submission");

const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const getReactedUsers = require("../../utility/discord/reactions/getReactedUsers");
const getTagByEmojiCode = require("../../utility/discord/threads/getTagByEmojiCode");
const fetchMessages = require("../../utility/discord/messages/fetchMessages");
const getVideosFromMessage = require("../../utility/discord/messages/getVideosFromMessage");
const createReactedThreadsFromVideos = require("../../utility/discord/threads/createReactedThreadsFromVideos");
const handleSubmissionApprove = require("../../utility/discord/submissionsVeto/handleSubmissionApprove");
const handleSubmissionDeny = require("../../utility/discord/submissionsVeto/handleSubmissionDeny");
const tallyReactions = require("../../utility/discord/reactions/tallyReactions");
const handleVetoPending = require("../../utility/discord/submissionsVeto/handleVetoPending");

const judgementEmojis = process.env.JUDGEMENT_EMOJIS.split(", ");
const waitingEmojis = process.env.WAITING_EMOJIS.split(", ");

module.exports = {
	data: new SlashCommandBuilder()
		.setName("sync")
		.setDescription("Sync the bot up with the current server state.")
		.addStringOption(optionBuilder => 
			optionBuilder.setName("mode")
				.setDescription("Which parts of the server should be synced.")
				.setRequired(true)
				.addChoices(
					{name: "Intake", value: "intake"},
					{name: "Forums", value: "forums"},
					{name: "Judges", value: "judges"},
					{name: "All", value: "all"}
				)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const deferPromise = interaction.deferReply({ephemeral: true});
		
		const mode = interaction.options.getString("mode", true);
		
		let promisedChannels;
		const channelManager = interaction.client.channels;
		switch(mode) {
			case("judges"):
				promisedChannels = await Promise.all([
					channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID), 
					channelManager.fetch(process.env.VETO_FORUM_ID)
				]);
				await handleJudgeSync(promisedChannels[0], promisedChannels[1]); 
				break;
			case("intake"):
				promisedChannels = await Promise.all([
					channelManager.fetch(process.env.SUBMISSIONS_INTAKE_ID), 
					channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID)]);
				await handleIntakeSync(promisedChannels[0], promisedChannels[1]); 
				break;
			case("forums"):
				promisedChannels = await Promise.all([
					channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID), 
					channelManager.fetch(process.env.VETO_FORUM_ID)
				]);
				await handleForumsSync(promisedChannels[0], promisedChannels[1]);
				break;
			case("all"):
				promisedChannels = await Promise.all([
					channelManager.fetch(process.env.SUBMISSIONS_INTAKE_ID),
					channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID), 
					channelManager.fetch(process.env.VETO_FORUM_ID) // TODO BETTER CODE STRUCTURE WOULD BE PASS HTE PROMISES TO THE METHODS AND HAVE THEM AWAIT THEM INTERNALLY?
				]);
				await handleForumsSync(promisedChannels[1], promisedChannels[2]); // Intake happens after forum sync as it checks the DB before posting, which might not be ready if done in another order
				await handleIntakeSync(promisedChannels[0], promisedChannels[1]);
				await handleJudgeSync(promisedChannels[1], promisedChannels[2]);
		}

		await deferPromise;
		interaction.editReply("Sync complete!");
	}
};

async function handleForumsSync(submissionsForum, vetoForum) {
	const vetoThreadPromise = getAllThreads(vetoForum);
	const submissionsThreadPromise = getAllThreads(submissionsForum);

	let waitingTag = getTagByEmojiCode(vetoForum.availableTags, waitingEmojis[0]);
	const pendingTag = getTagByEmojiCode(vetoForum.availableTags, waitingEmojis[1]);
	let approvedTag = getTagByEmojiCode(vetoForum.availableTags, judgementEmojis[0]);
	let deniedTag = getTagByEmojiCode(vetoForum.availableTags, judgementEmojis[1]);
	let tagMap = new Map([
			[waitingTag.id, waitingTag],
			[pendingTag.id, pendingTag],
			[approvedTag.id, approvedTag],
			[deniedTag.id, deniedTag]
	]);

	const initialVetoThreads = await vetoThreadPromise;
	
	for(const initialVetoThread of initialVetoThreads.values()) {
		const entryPromise = Submission.enqueue(() => Submission.findOne({threadId: initialVetoThread.id}));

		const fetchedThread = await vetoForum.threads.fetch(initialVetoThread.id);
		const starterMessage = await fetchedThread.fetchStarterMessage({cache: false});
		const videoLink = getVideosFromMessage(starterMessage, false)[0]; // These messages will only ever have one video link
		
		let entry = await entryPromise;
		if(!entry) {
			entry = await Submission.create({
				threadId: fetchedThread.id, 
				videoLink: videoLink,
				status: "AWAITING VETO"
			});
		}

		const appliedTag = tagMap.get(fetchedThread.appliedTags[0]);
		if(appliedTag.name === "Awaiting Veto") { // We only care about Awaiting Veto because Approved/Denied have completed their lifecycle, and Pending Approval should be handled on bot launch
			const reactionCounts = await tallyReactions(starterMessage, [judgementEmojis[0], judgementEmojis[1]]);
			if(reactionCounts[0] + reactionCounts[1] >= +process.env.VETO_THRESHOLD + 2) {
				handleVetoPending(fetchedThread, pendingTag.id, starterMessage);
			}
		} else {
			entry.status = appliedTag.name;
			await Submission.enqueue(() => entry.save());
		}
	}

	waitingTag = getTagByEmojiCode(submissionsForum.availableTags, waitingEmojis[0]);
	approvedTag = getTagByEmojiCode(submissionsForum.availableTags, judgementEmojis[0]);
	deniedTag = getTagByEmojiCode(submissionsForum.availableTags, judgementEmojis[1]);
	tagMap = new Map([
		[waitingTag.id, waitingTag],
		[approvedTag.id, approvedTag],
		[deniedTag.id, deniedTag]
	]);

	const initialSubmissionsThreads = await submissionsThreadPromise;
	for(const initialSubmissionsThread of initialSubmissionsThreads.values()) {
		const entryPromise = Submission.enqueue(() => Submission.findOne({threadId: initialSubmissionsThread.id}));

		const fetchedThread = await submissionsForum.threads.fetch(initialSubmissionsThread.id);
		const starterMessage = await fetchedThread.fetchStarterMessage({cache: false});
		const videoLink = getVideosFromMessage(starterMessage, false)[0];

		let entry = await entryPromise;
		if(!entry) {
			entry = await Submission.enqueue(() => Submission.findOne({videoLink: videoLink}));
			if(entry) continue; // Indicates that the entry is already in the veto stage, which will have been synced by this point
			else entry = await Submission.create({
					threadId: fetchedThread.id, 
					videoLink: videoLink,
					status: "AWAITING DECISION"
				});
		}

		const appliedTag = tagMap.get(fetchedThread.appliedTags[0]);
		if(appliedTag.name === "Awaiting Decision") {
			const reactionCounts = await tallyReactions(starterMessage, [judgementEmojis[0], judgementEmojis[1]]);
			if(reactionCounts[0] > reactionCounts[1]) {
				await handleSubmissionApprove(fetchedThread, submissionsForum.availableTags, starterMessage);
			} else if(reactionCounts[0] < reactionCounts[1]) {
				handleSubmissionDeny(fetchedThread, submissionsForum.availableTags);
			}
		}
	}
}

async function handleIntakeSync(intakeChannel, submissionsForum) {
	const initialMessages = await fetchMessages(intakeChannel, process.env.INTAKE_SYNC_MAX);
	for(const initialMessage of initialMessages) {
		const message = await intakeChannel.messages.fetch(initialMessage.id);

		const videoLinks = getVideosFromMessage(message);
		for(const videoLink of videoLinks) {
			const alreadyExists = await Submission.exists({videoLink: videoLink});
			if(alreadyExists) continue;

			const thread = (await createReactedThreadsFromVideos([videoLink], submissionsForum))[0];
			Submission.enqueue(() => Submission.create({threadId: thread.id, videoLink: videoLink, status: "AWAITING DECISION"}));
			Judge.enqueue(() => Judge.updateMany({}, {$push: {unjudgedThreadIds: thread.id}}));
		}
	}
}

async function handleJudgeSync(submissionsForum, vetoForum) {
	const judgeSyncPromises = [2];
	judgeSyncPromises[0] = await updateJudges("nominator", [vetoForum]);
	judgeSyncPromises[1] = await updateJudges("admin", [vetoForum, submissionsForum])
	await Promise.all(judgeSyncPromises);
}

async function updateJudges(judgeType, forums) {
	const judgeMap = new Map();
	const judges = await Judge.enqueue(() => Judge.find({judgeType: judgeType}).select({userId: 1, _id: 0}));

	for(const judge of judges) {
		judgeMap.set(judge.userId, []);
	}

	for(const forum of forums) {
		const judgedTagIds = [
			getTagByEmojiCode(forum.availableTags, judgementEmojis[0]).id,
			getTagByEmojiCode(forum.availableTags, judgementEmojis[1]).id
		];

		const initialThreads = await getAllThreads(forum);
		for(const initialThread of initialThreads.values()) {
			const fetchedThread = await forum.threads.fetch(initialThread);
			if(!fetchedThread) continue;
			if(fetchedThread.appliedTags.some((appliedTag => judgedTagIds.includes(appliedTag)))) continue;

			const starterMessage = await fetchedThread.fetchStarterMessage({cache: false, force: true}); // Reactions may not be cached so we force
			const reactedUserIds = await getReactedUsers(starterMessage, judgementEmojis);

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

// CODE FOR DUPE THREADS (VERY UNUSUAL CIRCUMSTANCE)

	// const approvedTag = getTagByEmojiCode(vetoForum.availableTags, judgementEmojis[0]);
	// const waitingTag = getTagByEmojiCode(vetoForum.availableTags, waitingEmojis[0]);
	// const pendingTag = getTagByEmojiCode(vetoForum.availableTags, waitingEmojis[1]);
	// const deniedTag = getTagByEmojiCode(vetoForum.availableTags, judgementEmojis[1]);
	// const vetoTagMap = new Map([
	// 	[waitingTag.id, waitingTag],
	// 	[pendingTag.id, pendingTag],
	// 	[deniedTag.id, deniedTag],
	// 	[approvedTag.id, approvedTag]
	// ]);

	// const initialVetoThreads = await vetoThreadPromise;

	// // for(const initialThread of initialVetoThreads.values()) { // May be redundant
	// // 	let fetchedThread = await vetoForum.threads.fetch(initialThread);
	// // 	const starterMessage = await fetchedThread.fetchStarterMessage({cache: false});
	// // 	const videoLink = getVideosFromText(starterMessage.content)[0];
	// // 	const entries = await Submission.enqueue(() => Submission.find({videoLink: videoLink}));
	// // 	console.log(`ENTRIES ${entries}`);
	// // 	if(entries.length > 1) {
	// // 		console.log("Larger than 1");
	// // 		const otherThreadPromises = [];
	// // 		for(const entry of entries) {
	// // 			if(entry.threadId === fetchedThread.id) continue;
	// // 			otherThreadPromises.push(vetoForum.threads.fetch(entry.threadId));
	// // 		}

	// // 		const extraThreads = [1 + otherThreadPromises.length];
	// // 		extraThreads[0] = fetchedThread;
	// // 		extraThreads.push(await Promise.all(otherThreadPromises));
	// // 		console.log(`Extra Threads: ${extraThreads}`)
	// // 		extraThreads.sort(async (threadA, threadB) => {
	// // 			console.log(`THREAD A: ${threadA}`)
	// // 			console.log(`THREAD B: ${threadB}`)
	// // 			if(!threadA) return 1;
	// // 			if(!threadB) return -1;

	// // 			const aTagPriority = vetoTagMap.keys().findIndex(threadA.appliedTags[0]).clamp(0, 2);
	// // 			const bTagPriority = vetoTagMap.keys().findIndex(threadB.appliedTags[0]).clamp(0, 2);
	// // 			if(aTagPriority > bTagPriority) return -1;
	// // 			if(aTagPriority < bTagPriority) return 1;
				
	// // 			const starterMessages = await Promise.all([
	// // 				threadA.fetchStarterMessage({cache: false}),
	// // 				threadB.fetchStarterMessage({cache: false})
	// // 			]).map(starterMessage => 
	// // 					tallyReactions(starterMessage, ...judgementEmojis)
	// // 					.reduce((accumulator, count) => accumulator + count)
	// // 			);
	// // 			if(starterMessages[0] > starterMessages[1]) return -1;
	// // 			if(starterMessages[0] < starterMessages[1]) return 1;
	// // 			return 0;
	// // 		});
			
	// // 		Submission.enqueue(() => Submission.deleteMany({videoLink: videoLink, threadId: {$ne: extraThreads[0].id}}));
	// // 	}
	// 	break; // delete htis TODO