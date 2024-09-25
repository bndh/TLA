require("dotenv").config();
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const { Judge, Submission } = require("../../mongo/mongoModels").modelData;

const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const getReactedUsers = require("../../utility/discord/reactions/getReactedUsers");
const getTagByEmojiCode = require("../../utility/discord/threads/getTagByEmojiCode");
const fetchMessages = require("../../utility/discord/messages/fetchMessages");
const getVideosFromMessage = require("../../utility/discord/messages/getVideosFromMessage");
const createReactedThreadsFromVideos = require("../../utility/discord/threads/createReactedThreadsFromVideos");
const handleSubmissionApprove = require("../../utility/discord/submissionsVeto/handleSubmissionApprove");
const handleSubmissionReject = require("../../utility/discord/submissionsVeto/handleSubmissionReject");
const tallyReactions = require("../../utility/discord/reactions/tallyReactions");
const handleVetoPending = require("../../utility/discord/submissionsVeto/handleVetoPending");
const submissionLinkExists = require("../../utility/submissionLinkExists");

const judgementEmojiCodes = process.env.JUDGEMENT_EMOJI_CODES.split(", ");
const openEmojiCodes = process.env.OPEN_EMOJI_CODES.split(", ");
// TODO SO MANY EDGE CASES FOR FORUM SYNC... LIST AND TRULY SORT
module.exports = {
	data: new SlashCommandBuilder()
		.setName("sync")
		.setDescription("Sync the bot up with the current server state.")
		.addStringOption(optionBuilder => optionBuilder
			.setName("mode")
			.setDescription("Which parts of the server should be synced.")
			.setRequired(true)
			.addChoices(
				{name: "Intake", value: "intake"},
				{name: "Forums", value: "forums"},
				{name: "Judges", value: "judges"},
				{name: "All", value: "all"}
			)
		)
		.addIntegerOption(optionBuilder => optionBuilder
			.setName("max-intake")
			.setDescription("The maximum number of messages to be scanned from #submissions-intake.")
			.setRequired(false)
			.setMinValue(0)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply({ephemeral: true});
		
		const mode = interaction.options.getString("mode", true);
		const maxIntake = interaction.options.getInteger("max-intake", false) ?? process.env.MAX_INTAKE_SYNC;
		const channelManager = interaction.client.channels;

		if(mode === "forums") await forumsSetupAndSync(channelManager);
		else if(mode === "intake") await intakeSetupAndSync(channelManager);
		else if(mode === "judges") await judgeSetupAndSync(channelManager);
		else {
			let promisedChannels = await Promise.all([
				channelManager.fetch(process.env.SUBMISSIONS_INTAKE_ID),
				channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID), 
				channelManager.fetch(process.env.VETO_FORUM_ID) // TODO BETTER CODE STRUCTURE WOULD BE PASS HTE PROMISES TO THE METHODS AND HAVE THEM AWAIT THEM INTERNALLY?
			]);
			await handleForumsSync(promisedChannels[1], promisedChannels[2]); // Intake happens after forum sync as it checks the DB before posting, which might not be ready if done in another order
			await handleIntakeSync(promisedChannels[0], promisedChannels[1], maxIntake);
			await handleJudgeSync(promisedChannels[1], promisedChannels[2]);
		}

		interaction.editReply("Sync complete!");
	}
};

async function forumsSetupAndSync(channelManager) {
	let promisedChannels = await Promise.all([
		channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID), 
		channelManager.fetch(process.env.VETO_FORUM_ID)
	]);
	handleForumsSync(promisedChannels[0], promisedChannels[1]);
}

async function handleForumsSync(submissionsForum, vetoForum) {
	console.info("==> Starting Forum Sync");
	const vetoThreadPromise = getAllThreads(vetoForum);
	const submissionsThreadPromise = getAllThreads(submissionsForum);
	console.info("Syncing Veto...");
	await handleVetoSync(vetoForum, await vetoThreadPromise);
	console.info("Syncing Submissions...");
	await handleSubmissionSync(submissionsForum, await submissionsThreadPromise);
	console.info("==> Finished Forum Sync");
}

async function intakeSetupAndSync(channelManager) {
	console.info("==> Starting Intake Sync");
	promisedChannels = await Promise.all([
		channelManager.fetch(process.env.SUBMISSIONS_INTAKE_ID), 
		channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID)]);
	await handleIntakeSync(promisedChannels[0], promisedChannels[1], maxIntake);
	console.info("==> Finished Intake Sync");
}

async function handleIntakeSync(intakeChannel, submissionsForum, maxIntake) {
	const initialMessages = await fetchMessages(intakeChannel, maxIntake);
	for(const initialMessage of initialMessages) {
		const message = await intakeChannel.messages.fetch(initialMessage.id);

		const videoLinks = getVideosFromMessage(message);
		for(const videoLink of videoLinks) {
			if(await submissionLinkExists(videoLink)) continue;

			const thread = (await createReactedThreadsFromVideos([videoLink], submissionsForum))[0];
			Submission.enqueue(() => Submission.create({
				threadId: thread.id, 
				videoLink: videoLink, 
				status: "AWAITING DECISION"
			}));
			Judge.enqueue(() => Judge.updateMany({}, {$push: {unjudgedThreadIds: thread.id}}).exec());
		}
	}
}

async function judgeSetupAndSync(channelManager) {
	console.info("==> Starting Judge Sync");
	let promisedChannels = await Promise.all([
		channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID), 
		channelManager.fetch(process.env.VETO_FORUM_ID)
	]);
	await handleJudgeSync(promisedChannels[0], promisedChannels[1]); 
	console.info("==> Finished Judge Sync");
}

async function handleJudgeSync(submissionsForum, vetoForum) {
	const judgeSyncPromises = Array(2);
	judgeSyncPromises[0] = await updateJudges("nominator", [vetoForum]);
	judgeSyncPromises[1] = await updateJudges("admin", [vetoForum, submissionsForum])
	await Promise.all(judgeSyncPromises);
}

async function handleVetoSync(vetoForum, vetoThreadPromise) {
	const pendingTag = getTagByEmojiCode(vetoForum, openEmojiCodes[1]);
	let tagMap = createIdTagMap(
		getTagByEmojiCode(vetoForum, openEmojiCodes[0]), 
		pendingTag, // Used later if the submission should be changed to pending 
		getTagByEmojiCode(vetoForum, judgementEmojiCodes[1]), 
		getTagByEmojiCode(vetoForum, judgementEmojiCodes[1])
	);

	const initialVetoThreads = await vetoThreadPromise;
	
	for(const initialVetoThread of initialVetoThreads.values()) {
		const entryPromise = Submission.enqueue(() => Submission.findOne({threadId: initialVetoThread.id}).exec());

		let fetchedThread = await vetoForum.threads.fetch(initialVetoThread.id);
		let starterMessage;
		try {
			starterMessage = await fetchedThread.fetchStarterMessage({cache: false});
		} catch(error) {
			starterMessage = undefined;
		}

		let entry = await entryPromise; 
		
		if(!starterMessage) { // Searching for an alternative submission requires knowledge of the videoLink, so we try to resolve a missing video link before we do a missing entry
			if(entry && entry.videoLink) { // Salvageable. Lazily evaluated so no need to worry about entry.videoLink causing issues when entry is undefined / null
				const oldThreadTagId = fetchedThread.appliedTags[0]; // Replace old thread with new (to preserve the starter message aesthetic)
				await fetchedThread.delete("Replaced by new thread as old thread did not have a videoLink.");
				fetchedThread = (await createReactedThreadsFromVideos([entry.videoLink], vetoForum))[0];
				starterMessage = await fetchedThread.fetchStarterMessage({cache: false});
				fetchedThread.setAppliedTags([oldThreadTagId]);

				entry.threadId = fetchedThread.id; // Update entry
				await Submission.enqueue(() => entry.save()); // Need to save here as the new threadId would not be preserved in the handleVetoPending method
			} else { // Cannot find a videoLink so must abort
				let deletionPromises = Array(2);
				deletionPromises[0] = fetchedThread.delete("Could not find video during forum sync.");
				if(entry) {
					deletionPromises[1] = Submission.enqueue(() => Submission.deleteOne({_id: entry._id}));
				}
				await Promise.all(deletionPromises);
				continue;
			}
		}
		const videoLink = getVideosFromMessage(starterMessage, false)[0];

		if(!entry) {
			entry = await Submission.enqueue(() => Submission.create({
				threadId: fetchedThread.id, 
				videoLink: videoLink,
				status: "TEMP" // Status will be overwritten by the end of the method
			}));
		}
		
		const appliedTag = tagMap.get(fetchedThread.appliedTags[0]);
		if(appliedTag.name === "Awaiting Veto") { // We only care about Awaiting Veto because Approved/Denied have completed their lifecycle
			const reactionCounts = await tallyReactions(starterMessage, [judgementEmojiCodes[0], judgementEmojiCodes[1]]);
			if(reactionCounts[0] + reactionCounts[1] >= +process.env.VETO_THRESHOLD + 2) {
				handleVetoPending(fetchedThread, pendingTag.id, starterMessage); // Updates entry
			}
			continue;
		}
		if(appliedTag.name === "Pending Approval") {
			if(entry.expirationTime) {
				const timeout = pendingThread.expirationTime - Date.now().valueOf();
				setTimeout(() => handleVetoJudgement(client, pendingThread.threadId), timeout);
			} else { // Also implies that there was no entry, in which case we have nothing to go off for the expiration time, so we start a fully new one
				handleVetoPending(fetchedThread, pendingTag.id, starterMessage); // Sets status
			}
		}

		entry.status = appliedTag.name;
		await Submission.enqueue(() => entry.save());
	}
}

async function handleSubmissionSync(submissionsForum, submissionsThreadPromise) {
	const approvedTag = getTagByEmojiCode(submissionsForum, judgementEmojiCodes[0]);
	const tagMap = createIdTagMap(
		getTagByEmojiCode(submissionsForum, openEmojiCodes[0]), 
		approvedTag,
		getTagByEmojiCode(submissionsForum, judgementEmojiCodes[1])
	);

	const initialSubmissionsThreads = await submissionsThreadPromise;
	for(const initialSubmissionsThread of initialSubmissionsThreads.values()) {
		const entryPromise = Submission.enqueue(() => Submission.findOne({threadId: initialSubmissionsThread.id}).exec());

		let fetchedThread = await submissionsForum.threads.fetch(initialSubmissionsThread.id);
		let starterMessage; // Starter message may have been deleted, so:
		try {
			starterMessage = await fetchedThread.fetchStarterMessage({cache: false}); 
		} catch(error) {
			starterMessage = undefined;
		}
		
		let entry = await entryPromise;

		if(!starterMessage) {
			if(entry && entry.videoLink) {
				const oldThreadTagId = fetchedThread.appliedTags[0];
				await fetchedThread.delete("Replaced by new thread as old thread did not have a videoLink.");
				fetchedThread = (await createReactedThreadsFromVideos([entry.videoLink], submissionsForum))[0];
				starterMessage = await fetchedThread.fetchStarterMessage({cache: false});
				fetchedThread.setAppliedTags([oldThreadTagId]);

				entry.threadId = fetchedThread.id; // Update entry with new data
				await Submission.enqueue(() => entry.save()); // Need to save here as the new threadId would not be preserved in the sumbissionApprove/Deny methods
			} else { // Not salvageable so must delete
				let deletionPromises = Array(2);
				deletionPromises[0] = fetchedThread.delete("Could not find video during forum sync.");
				if(entry) {
					deletionPromises[1] = Submission.enqueue(() => Submission.deleteOne({_id: entry._id}));
				}
				await Promise.all(deletionPromises);
				continue;
			}
		}

		const videoLink = getVideosFromMessage(starterMessage, false)[0]; // Should be no case where a submission does not have a videoLink 

		if(!entry) {
			entry = await Submission.enqueue(() => Submission.findOne({videoLink: videoLink}).exec());
			if(entry) { // Indicates that the thread already exists in veto
				fetchedThread.setAppliedTags([approvedTag.id]);
				continue; // Indicates that the entry is already in the veto stage, which will have been synced by this point
			} else entry = await Submission.create({
					threadId: fetchedThread.id, 
					videoLink: videoLink,
					status: "TEMP"
			});
		}
		
		const appliedTag = tagMap.get(fetchedThread.appliedTags[0]);
		if(appliedTag.name === "Awaiting Decision") {
			const reactionCounts = await tallyReactions(starterMessage, [judgementEmojiCodes[0], judgementEmojiCodes[1]]);
			if(reactionCounts[0] > reactionCounts[1]) {
				await handleSubmissionApprove(fetchedThread, starterMessage);
			} else if(reactionCounts[0] < reactionCounts[1]) {
				handleSubmissionReject(fetchedThread);
			}
		} else {
			entry.status = appliedTag.name;
			await Submission.enqueue(() => entry.save());
		}
	}
}

async function updateJudges(judgeType, forums) {
	const judgeMap = new Map();
	const judges = await Judge.enqueue(() => Judge.find({judgeType: judgeType}).select({userId: 1, _id: 0}).exec());

	for(const judge of judges) {
		judgeMap.set(judge.userId, []);
	}

	for(const forum of forums) {
		const judgedTagIds = [
			getTagByEmojiCode(forum, judgementEmojiCodes[0]).id,
			getTagByEmojiCode(forum, judgementEmojiCodes[1]).id
		];

		const initialThreads = await getAllThreads(forum);
		for(const initialThread of initialThreads.values()) {
			const fetchedThread = await forum.threads.fetch(initialThread);
			if(!fetchedThread) continue;
			if(fetchedThread.appliedTags.some((appliedTag => judgedTagIds.includes(appliedTag)))) continue;

			const starterMessage = await fetchedThread.fetchStarterMessage({cache: false, force: true}); // Reactions may not be cached so we force
			const reactedUserIds = await getReactedUsers(starterMessage, judgementEmojiCodes);

			for(const judgeId of judgeMap.keys()) {
				if(reactedUserIds.includes(judgeId)) continue;
				judgeMap.get(judgeId).push(fetchedThread.id);	
			}
		}
	}

	for(const judgeId of judgeMap.keys()) {
		Judge.enqueue(() => Judge.updateOne({userId: judgeId}, {unjudgedThreadIds: judgeMap.get(judgeId)}).exec());
	}
}

function createIdTagMap(...tags) {
	const tagMap = new Map([]);
	tags.forEach(tag => tagMap.set(tag.id, tag));
	return tagMap;
}