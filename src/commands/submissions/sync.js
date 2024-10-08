require("dotenv").config();
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const { Judge, Submission } = require("../../mongo/mongoModels").modelData;

const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const getReactedUserIds = require("../../utility/discord/reactions/getReactedUserIds");
const getTagByEmojiCode = require("../../utility/discord/threads/getTagByEmojiCode");
const fetchMessages = require("../../utility/discord/messages/fetchMessages");
const getVideosFromMessage = require("../../utility/discord/messages/getVideosFromMessage");
const createReactedThreadsFromVideos = require("../../utility/discord/threads/createReactedThreadsFromVideos");
const handleSubmissionApprove = require("../../utility/discord/submissionsVeto/handleSubmissionApprove");
const handleSubmissionReject = require("../../utility/discord/submissionsVeto/handleSubmissionReject");
const tallyReactions = require("../../utility/discord/reactions/tallyReactions");
const handleVetoPending = require("../../utility/discord/submissionsVeto/handleVetoPending");
const handleVetoJudgement = require("../../utility/discord/submissionsVeto/handleVetoJudgement");
const submissionLinkExists = require("../../utility/submissionLinkExists");
const youtubeIdRegex = require("../../utility/youtubeIdRegex");
const sumReactions = require("../../utility/discord/reactions/sumReactions");

const JUDGEMENT_EMOJI_CODES = process.env.JUDGEMENT_EMOJI_CODES.split(", ");
const OPEN_EMOJI_CODES = process.env.OPEN_EMOJI_CODES.split(", ");

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
	async execute(interaction) { // TODO fix reply (longer than 15 mins to reply :( ))
		// interaction.reply({embeds: [EmbedBuilder.generateFailEmbed("This command is currently under maintenance!")]});
		// return;
		await interaction.deferReply({ephemeral: true});

		const mode = interaction.options.getString("mode", true);
		const maxIntake = interaction.options.getInteger("max-intake", false) ?? process.env.MAX_INTAKE_SYNC;

		console.info(`COMMAND ${this.data.name} USED BY ${interaction.user.id} IN ${interaction.channelId} WITH mode ${mode} AND maxIntake ${maxIntake}`);

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
	},
	pendingThreadDocs: new Map(),
	e
};

async function forumsSetupAndSync(channelManager) {
	let promisedChannels = await Promise.all([
		channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID), 
		channelManager.fetch(process.env.VETO_FORUM_ID)
	]);
	await handleForumsSync(promisedChannels[0], promisedChannels[1]);
}

async function handleForumsSync(submissionsForum, vetoForum) {
	console.info("==> STARTING FORUM SYNC");
	// const vetoThreadPromise = getAllThreads(vetoForum);
	// const submissionsThreadPromise = getAllThreads(submissionsForum);
	console.info("Syncing Veto...");
	// await handleVetoSync(vetoForum, await vetoThreadPromise);
	await handleVetoSync2(vetoForum, submissionsForum);
	console.info("Syncing Submissions...");
	// await handleSubmissionSync(submissionsForum, await submissionsThreadPromise);
	//await handleSubmissionSync2(submissionsForum, vetoForum);
	console.info("==> FINISHED FORUM SYNC");
}

async function intakeSetupAndSync(channelManager) {
	console.info("==> STARTING INTAKE SYNC");
	promisedChannels = await Promise.all([
		channelManager.fetch(process.env.SUBMISSIONS_INTAKE_ID), 
		channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID)]);
	await handleIntakeSync(promisedChannels[0], promisedChannels[1], maxIntake); // TODO maxIntake missing?
	console.info("==> FINISHED INTAKE SYNC");
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
	console.info("==> STARTING JUDGE SYNC");
	let promisedChannels = await Promise.all([
		channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID), 
		channelManager.fetch(process.env.VETO_FORUM_ID)
	]);
	await handleJudgeSync(promisedChannels[0], promisedChannels[1]); 
	console.info("==> FINISHED JUDGE SYNC");
}

async function handleJudgeSync(submissionsForum, vetoForum) {
	const judgeSyncPromises = Array(2);
	judgeSyncPromises[0] = await updateJudges("nominator", [vetoForum]);
	judgeSyncPromises[1] = await updateJudges("admin", [vetoForum, submissionsForum])
	await Promise.all(judgeSyncPromises);
}

async function handleVetoSync(vetoForum, vetoThreadPromise) {
	const pendingTag = getTagByEmojiCode(vetoForum, OPEN_EMOJI_CODES[1]);
	let tagMap = createIdTagMap(
		getTagByEmojiCode(vetoForum, OPEN_EMOJI_CODES[0]), 
		pendingTag, // Used later if the submission should be changed to pending 
		getTagByEmojiCode(vetoForum, JUDGEMENT_EMOJI_CODES[0]), 
		getTagByEmojiCode(vetoForum, JUDGEMENT_EMOJI_CODES[1])
	);

	const initialVetoThreads = await vetoThreadPromise;
	
	for(const initialVetoThread of initialVetoThreads.values()) {
		const entryPromise = Submission.enqueue(() => Submission.findOne({threadId: initialVetoThread.id}).exec());

		let fetchedThread = await vetoForum.threads.fetch(initialVetoThread.id, {force: true});
		
		let starterMessage;
		try { starterMessage = await fetchedThread.fetchStarterMessage({cache: false});
		} catch(error) { starterMessage = undefined; }

		let entry = await entryPromise; 
		
		if(!starterMessage) { // Searching for an alternative submission requires knowledge of the videoLink, so we try to resolve a missing video link before we do a missing entry
			if(entry && entry.videoLink) { // Salvageable
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
			const reactionCounts = await tallyReactions(starterMessage, [JUDGEMENT_EMOJI_CODES[0], JUDGEMENT_EMOJI_CODES[1]]);
			if(reactionCounts[0] + reactionCounts[1] >= +process.env.VETO_THRESHOLD + 2) {
				handleVetoPending(fetchedThread, pendingTag.id, starterMessage); // Updates entry
			}
			continue;
		}
		if(appliedTag.name === "Pending Approval") {
			if(entry.expirationTime) {
				const timeout = fetchedThread.expirationTime - Date.now().valueOf();
				setTimeout(() => handleVetoJudgement(client, fetchedThread.id), timeout);
			} else { // Also implies that there was no entry, in which case we have nothing to go off for the expiration time, so we start a fully new one
				handleVetoPending(fetchedThread, pendingTag.id, starterMessage); // Sets status
			}
		}

		entry.status = appliedTag.name;
		await Submission.enqueue(() => entry.save());
	}
}

async function handleSubmissionSync(submissionsForum, submissionsThreadPromise) {
	const approvedTag = getTagByEmojiCode(submissionsForum, JUDGEMENT_EMOJI_CODES[0]);
	const tagMap = createIdTagMap(
		getTagByEmojiCode(submissionsForum, OPEN_EMOJI_CODES[0]), 
		approvedTag,
		getTagByEmojiCode(submissionsForum, JUDGEMENT_EMOJI_CODES[1])
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
			const reactionCounts = await tallyReactions(starterMessage, [JUDGEMENT_EMOJI_CODES[0], JUDGEMENT_EMOJI_CODES[1]]);
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

const VETO_SALVAGE_CODE = "SaV";
const SUBMISSIONS_SALVAGE_CODE = "SaS";
const VETO_SYNC_CODE = "SyV";
const SUBMISSIONS_SYNC_CODE = "SyS";
const JUDGE_SYNC_CODE = "SyJ";

async function e(forumJudgeTypeMap, judgeTypes) {
	const judgeTypeMap = new Map( // Map(judgeTypes => Map(judgeIds => judges))
		await Promise.all(judgeTypes.map(judgeType =>
			new Promise(async resolve => {
				const typedJudges = await Judge.enqueue(() => Judge.find({judgeType: judgeType}));
				const judgeIdMap = new Map(typedJudges.map(judge => {
					judge.counselledSubmissionIds = [];
					judge.totalSubmissionsClosed = 0;
					return [judge.userId, judge];
				}));
				resolve([judgeType, judgeIdMap]);
			})
		))
	);

	const idMaps = await Promise.all(
		[...forumJudgeTypeMap.entries()].map(async entry => {
			const forumJudgeTypes = entry[1];
			const judgeIdMap = new Map(forumJudgeTypes.flatMap(judgeType => [...judgeTypeMap.get(judgeType)]));
			return pushCounselledClosedSubmissions(entry[0], judgeIdMap);
		}
	));
	console.log("out");
	const iter = idMaps.values();
	while((data = iter.next().value) !== undefined) {
		console.log(data);
	}
}

async function pushCounselledClosedSubmissions(forum, judgeIdMap) {
	const openTagIds = OPEN_EMOJI_CODES.map(emojiCode => getTagByEmojiCode(forum, emojiCode));
	console.log("getting " + forum.id);
	const bulkThreads = await getAllThreads(forum);
	console.log("got " + bulkThreads.size + " threads");
	const iter = judgeIdMap.values();
	while((data = iter.next().value) !== undefined) {
		data.totalSubmissionsClosed += bulkThreads.size;
	}
	return judgeIdMap;
	// for(const cachedThread of bulkThreads) {
	// 	const fetchedThread = await forum.threads.fetch(cachedThread);
	// 	if(!cachedThread) continue;

	// 	const starterMessage = await fetchedThread.fetchStarterMessage({cache: false});
	// 	const reactedUserIds = await getReactedUserIds(starterMessage, JUDGEMENT_EMOJI_CODES);

	// 	const open = openTagIds.some(closedTag => fetchedThread.appliedTags.includes(closedTag));
	// 	for(const userId of reactedUserIds) {
	// 		const judge = judgeIdMap.get(userId);
	// 		if(!judge) continue;

	// 		if(open) judge.counselledSubmissionIds.push(fetchedThread.id);
	// 		else judge.totalSubmissionsClosed++;
	// 	}
	// }
}

async function updateJudges(judgeType, forums) {
	const judgeMap = new Map();
	const judges = await Judge.enqueue(() => Judge.find({judgeType: judgeType}).select({userId: 1, _id: 0}).exec());

	for(const judge of judges) {
		judgeMap.set(judge.userId, []);
	}

	for(const forum of forums) {
		const judgedTagIds = [
			getTagByEmojiCode(forum, JUDGEMENT_EMOJI_CODES[0]).id,
			getTagByEmojiCode(forum, JUDGEMENT_EMOJI_CODES[1]).id
		];

		const initialThreads = await getAllThreads(forum);
		for(const initialThread of initialThreads.values()) {
			const fetchedThread = await forum.threads.fetch(initialThread);
			if(!fetchedThread) continue;
			if(fetchedThread.appliedTags.some((appliedTag => judgedTagIds.includes(appliedTag)))) continue;

			const starterMessage = await fetchedThread.fetchStarterMessage({cache: false, force: true}); // Reactions may not be cached so we force
			const reactedUserIds = await getReactedUserIds(starterMessage, JUDGEMENT_EMOJI_CODES);

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

const VETO_EMOJI_CODES = [...JUDGEMENT_EMOJI_CODES, ...OPEN_EMOJI_CODES];
async function handleVetoSync2(vetoForum, submissionsForum) {
	const idTagMap = generateIdTagMap(vetoForum.availableTags);
	const waitingTag = vetoForum.availableTags.find(tag => tag.emoji.name === OPEN_EMOJI_CODES[0]);
	const pendingTagId = vetoForum.availableTags.find(tag => tag.emoji.name === OPEN_EMOJI_CODES[1]).id;

	const threadBulk = await getAllThreads(vetoForum);
	for(const bulkThread of threadBulk.values()) {
		let {fetchedThread, threadDoc, starterMessage, videoLink} = await getThreadDocMessageAndVideoLink(vetoForum, bulkThread.id);
		if(!fetchedThread) continue;
		
		if(!threadDoc || !starterMessage || !videoLink) {
			logSyncMessage(VETO_SALVAGE_CODE, `ATTEMPTING SALVAGE on ${fetchedThread.id}`);
			const logId = fetchedThread.id; // fetchedThread may be lost during salvage
			({thread: fetchedThread, threadDoc, starterMessage} = await salvageThreadData(
				fetchedThread, threadDoc, 
				starterMessage, videoLink,
				undefined, 
				submissionsForum, vetoForum,
				idTagMap,
				VETO_SALVAGE_CODE
			)); // In case some data cannot be found or does not exist (set approved tag map as undefined as veto will not go down that path)
			if(!fetchedThread || !threadDoc || !starterMessage) {
				logSyncMessage(VETO_SALVAGE_CODE, `COULD NOT SALVAGE thread ${logId}`);
				continue;
			}
			logSyncMessage(VETO_SALVAGE_CODE, `SALVAGED thread ${fetchedThread.id}`);
		}
		
		
		// let appliedTag = idTagMap.get(fetchedThread.appliedTags[0]);
		
		// if(!VETO_EMOJI_CODES.includes(appliedTag.emoji)) {
		// 	await fetchedThread.setAppliedTags([waitingTag.id]);
		// 	appliedTag = waitingTag;
		// }
	
		// if(appliedTag.name === "Awaiting Veto") await handleAwaitingVetoThread(fetchedThread, starterMessage, pendingTagId);
		// else if(appliedTag.name === "Pending Approval") handlePendingApprovalThread(fetchedThread, threadDoc, starterMessage, pendingTagId);
		// await matchThreadDocStatus(threadDoc, appliedTag.name);
	}
}

const SUBMISSION_EMOJI_CODES = [...JUDGEMENT_EMOJI_CODES, OPEN_EMOJI_CODES[0]];
async function handleSubmissionSync2(submissionsForum, vetoForum) {
	const idTagMap = generateIdTagMap(submissionsForum.availableTags);
	const approvedTagId = submissionsForum.availableTags.find(tag => tag.emoji.name === JUDGEMENT_EMOJI_CODES[0]).id;

	const threadBulk = await getAllThreads(submissionsForum);
	for(const bulkThread of threadBulk.values()) {
		let {fetchedThread, threadDoc, starterMessage, videoLink} = await getThreadDocMessageAndVideoLink(submissionsForum, bulkThread.id);
		if(!fetchedThread) continue;

		if(!threadDoc || !starterMessage || !videoLink) {
			logSyncMessage(SUBMISSIONS_SALVAGE_CODE, `ATTEMPTING SALVAGE on ${logId}`);
			const logId = fetchedThread.id; // fetchedThread may be lost during salvage
			({thread: fetchedThread, threadDoc, starterMessage} = await salvageThreadData( // In case some data cannot be found or does not exist
				fetchedThread, threadDoc, 
				starterMessage, videoLink,
				approvedTagId, 
				submissionsForum, vetoForum, 
				idTagMap,
				SUBMISSIONS_SALVAGE_CODE
			));

			if(!fetchedThread || !threadDoc || !starterMessage) {
				logSyncMessage(SUBMISSIONS_SALVAGE_CODE, `COULD NOT SALVAGE thread ${logId}`);
				continue;
			}
			logSyncMessage(SUBMISSIONS_SALVAGE_CODE, `SALVAGED thread ${fetchedThread.id}`);
		}
		
		// let appliedTag = idTagMap.get(fetchedThread.appliedTags[0]);

		// if(!SUBMISSION_EMOJI_CODES.includes(appliedTag.emoji)) {
		// 	await fetchedThread.setAppliedTags([waitingTag.id]);
		// 	appliedTag = waitingTag;
		// }

		// if(appliedTag.name === "Awaiting Decision") await handleAwaitingDecisionThread(fetchedThread, starterMessage, pendingTagId);
		// await matchThreadDocStatus(threadDoc, appliedTag.name);
	}
}

const VETO_STATUSES = ["AWAITING VETO", "PENDING APPROVAL", "APPROVED", "VETOED"];
async function salvageThreadData(thread, threadDoc, starterMessage, videoLink, approvedTagId, submissionsForum, vetoForum, idTagMap, salvageCode = "Sa") {
	if(!threadDoc && !starterMessage) {
		await thread.delete("FORUM SYNC: Could not salvage.");
		logSyncMessage(salvageCode, `DELETED thread ${thread.id}`, "Missing both thread doc and starter message");
		return {};
	}
	if(!videoLink) {
		if(!threadDoc) return await salvageMessagelessNoVideoLink(thread, threadDoc, salvageCode); // Unique edge case which otherwise breaks the below function due to absence of threadDoc
		return await salvageFromNoStarterMessage( // Checks threadDoc for salvage steps, which causes an error if threadDoc is absent
			thread, threadDoc,
			submissionsForum, vetoForum,
			salvageCode
		);
	}
	if(threadDoc && !starterMessage) { // Having no video link is equivalent to having no starter message
		return await salvageFromNoStarterMessage(
			thread, threadDoc, 
			submissionsForum, vetoForum, 
			salvageCode
		);
	}
	if(!threadDoc && starterMessage) {
		return await salvageFromNoThreadDoc(
			thread, 
			starterMessage, videoLink,
			approvedTagId, 
			submissionsForum, vetoForum, 
			idTagMap, 
			salvageCode
		);
	}
	return {fetchedThread: thread, threadDoc: threadDoc, starterMessage: starterMessage}; // No salvaging required
}

async function salvageFromNoStarterMessage(thread, threadDoc, submissionsForum, vetoForum, salvageCode) {
	if(!threadDoc.videoLink) return await salvageMessagelessNoVideoLink(thread, threadDoc, salvageCode);

	const youtubeMatch = threadDoc.videoLink.match(youtubeIdRegex);
	if(!youtubeMatch) return await salvageMessagelessNoVideoLink(thread, threadDoc, salvageCode);

	otherThreadDoc = await Submission.enqueue(() => Submission.findOne({threadId: {$ne: thread.id}, videoLink: {$regex: new RegExp(youtubeMatch[1])}}).exec());
	if(!otherThreadDoc) return await salvageMessagelessNoOtherDoc(thread, threadDoc, salvageCode);

	const otherThreadForum = VETO_STATUSES.includes(otherThreadDoc.status) ? vetoForum : submissionsForum;
	try { 
		const otherThread = await otherThreadForum.threads.fetch(otherThreadDoc.threadId);
		const otherStarterMessage = await otherThread.fetchStarterMessage();
		if(getVideosFromMessage(otherStarterMessage, false).length === 0) throw new Error("No video.");
	} catch(error) { // otherThread does not exist
		return await salvageMessagelessCompetitorVoid(thread, threadDoc, otherThreadDoc, salvageCode);
	}
	return await salvageMessagelessCompetitorReal(thread, threadDoc, salvageCode);
}

async function salvageFromNoThreadDoc(thread, starterMessage, videoLink, approvedTagId, submissionsForum, vetoForum, idTagMap, salvageCode) {
	const youtubeMatch = videoLink.match(youtubeIdRegex); // {link, id, index, input, groups}
	let otherThreadDoc = await Submission.enqueue(() => Submission.findOne({threadId: {$ne: thread.id}, videoLink: {$regex: new RegExp(youtubeMatch[1])}}).exec());
	if(!otherThreadDoc) return await salvageDoclessNoCompetitor(thread, starterMessage, videoLink, salvageCode);
	
	const otherThreadForum = VETO_STATUSES.includes(otherThreadDoc.status) ? vetoForum : submissionsForum;
	let otherThread, otherStarterMessage;
	try { 
		otherThread = await otherThreadForum.threads.fetch(otherThreadDoc.threadId);
		otherStarterMessage = await otherThread.fetchStarterMessage({force: true});
		if(getVideosFromMessage(otherStarterMessage, false).length === 0) throw new Error("No video.");
	} catch(error) { // otherThread does not exist
		return await salvageDoclessCompetitorVoid(thread, starterMessage, otherThreadDoc, salvageCode);
	}
	if(otherThreadForum.id === process.env.VETO_FORUM_ID) {
		if(thread.parent.id === process.env.VETO_FORUM_ID) return await salvageVetoAtVetoCompetitor(thread, starterMessage, otherThreadDoc, otherStarterMessage, salvageCode);
		else return await salvageSubmissionAtVetoCompetitor(thread, approvedTagId, salvageCode);
	} else {
		if(thread.parent.id === process.env.VETO_FORUM_ID) return await salvageVetoAtSubmissionCompetitor(thread, starterMessage, otherThreadDoc, salvageCode);
		else return await salvageSubmissionAtSubmissionCompetitor(thread, starterMessage, otherThread, otherThreadDoc, idTagMap, salvageCode);
	}
}

async function salvageDoclessNoCompetitor(thread, starterMessage, videoLink, salvageCode) {
	const newThreadDoc = await Submission.create({threadId: thread.id, videoLink: videoLink, status: "TEMP"}); // Status assigned later
	logSyncMessage(salvageCode, `CREATED NEW DOC for thread ${thread.id}`, "No alternative doc was found");
	return {thread: thread, threadDoc: newThreadDoc, starterMessage: starterMessage};
}

async function salvageDoclessCompetitorVoid(thread, starterMessage, otherThreadDoc, salvageCode) {
	otherThreadDoc = await redirectSaveSubmissionDoc(otherThreadDoc, thread.id);
	logSyncMessage(salvageCode, `REDIRECTED OTHER DOC to thread ${thread.id}`, "Alternative doc did not point to a real thread");
	return {thread: thread, threadDoc: otherThreadDoc, starterMessage: starterMessage};
}

async function salvageMessagelessNoVideoLink(thread, threadDoc, salvageCode) {
	await Promise.all([
		thread.delete("FORUM SYNC: Deleted as video link could not be found."),
		Submission.enqueue(() => Submission.deleteOne({_id: threadDoc._id}).exec())
	]);
	logSyncMessage(salvageCode, `DELETED thread and doc ${thread.id}`, "Thread and threadDoc missing video link");
	return {};
}

async function salvageMessagelessNoOtherDoc(thread, threadDoc, salvageCode) {
	const newThread = (await createReactedThreadsFromVideos([threadDoc.videoLink], thread.parent))[0];
	const docAndStarterMessage = await Promise.all([
		redirectSaveSubmissionDoc(threadDoc, newThread.id),
		newThread.fetchStarterMessage({force: true}),
		thread.delete("FORUM SYNC: Created new thread as starter message was missing and no replacement could be found."),
	]);

	logSyncMessage(salvageCode, `DELETED THREAD ${thread.id}, CREATED thread ${newThread.id} and REDIRECTED DOC to thread ${newThread.id}`, "No conflicting thread was found but starter message needed to be supplied");
	return {thread: newThread, threadDoc: docAndStarterMessage[0], starterMessage: docAndStarterMessage[1]};
}

async function salvageMessagelessCompetitorReal(thread, threadDoc, salvageCode) {
	await Promise.all([
		thread.delete("FORUM SYNC: Deleted as matching thread was found."),
		Submission.enqueue(() => Submission.deleteOne({_id: threadDoc._id}).exec())
	]) 
	logSyncMessage(salvageCode, `DELETED THREAD ${thread.id}`, "Competitor thread was found with video link while target thread was lacked one");
	return {};
}

async function salvageMessagelessCompetitorVoid(thread, threadDoc, otherThreadDoc, salvageCode) {
	const newThread = (await createReactedThreadsFromVideos([threadDoc.videoLink], thread.parent))[0];
	const docAndStarterMessage = await Promise.all([
		redirectSaveSubmissionDoc(threadDoc, newThread.id),
		newThread.fetchStarterMessage({force: true}),
		thread.delete("FORUM SYNC: Created new thread as starter message was missing, but DB doc was found."),
		Submission.enqueue(() => Submission.deleteOne({_id: otherThreadDoc._id}).exec())
	]);
	
	logSyncMessage(salvageCode, `DELETED THREAD ${thread.id}, CREATED thread ${newThread.id} and REDIRECTED DOC to thread ${newThread.id}`, "Conflicting thread did not exist/was missing data but starter message needed to be supplied");
	return {thread: newThread, threadDoc: docAndStarterMessage[0], starterMessage: docAndStarterMessage[1]};
}

async function salvageVetoAtVetoCompetitor(thread, starterMessage, otherThreadDoc, otherStarterMessage, salvageCode) {	
	const reactionCount = sumReactions(starterMessage, JUDGEMENT_EMOJI_CODES);
	const otherReactionCount = sumReactions(otherStarterMessage, JUDGEMENT_EMOJI_CODES);
	console.log(reactionCount);
	console.log(otherReactionCount);
	if(reactionCount > otherReactionCount) {
		otherThreadDoc = await redirectSaveSubmissionDoc(otherThreadDoc, thread.id);
		logSyncMessage(salvageCode, `REDIRECTED OTHER DOC to thread ${thread.id}`, "Competitor veto thread had less reactions");
		return {thread: thread, threadDoc: otherThreadDoc, starterMessage: starterMessage};
	}
	
	await thread.delete("FORUM SYNC: Deleted as competitor veto thread had more or equal votes.");
	logSyncMessage(salvageCode, `DELETED thread ${thread.id}`, "Competitor veto thread had more reactions");
	return {};
}

async function salvageSubmissionAtVetoCompetitor(thread, approvedTagId, salvageCode) {
	await thread.setAppliedTags([approvedTagId]);
	logSyncMessage(salvageCode, `SET TAG APPROVED for thread ${thread.id}`, "Matching doc points to veto forum");
	return {};
}

async function salvageVetoAtSubmissionCompetitor(thread, starterMessage, otherThreadDoc, salvageCode) {
	otherThreadDoc = await redirectSaveSubmissionDoc(otherThreadDoc, thread.id);
	logSyncMessage(salvageCode, `REDIRECTED OTHER DOC to thread ${thread.id}`, "Matching doc points to submissions forum");
	return {thread: thread, threadDoc: otherThreadDoc, starterMessage: starterMessage};
}

async function salvageSubmissionAtSubmissionCompetitor(thread, starterMessage, otherThread, otherThreadDoc, idTagMap, salvageCode) {
	const threadEmojiCode = idTagMap.get(thread.appliedTags[0]).emoji.name;
	const otherThreadEmojiCode = idTagMap.get(otherThread.appliedTags[0]).emoji.name;
	if(threadEmojiCode === otherThreadEmojiCode) {
		await thread.delete("FORUM SYNC: Deleted as matching thread was found during forum sync.");
		logSyncMessage(salvageCode, `DELETED thread ${thread.id}`, "Matching thread shares tag");
		return {};
	}

	const threadClosed = JUDGEMENT_EMOJI_CODES.includes(threadEmojiCode);
	const otherThreadClosed = JUDGEMENT_EMOJI_CODES.includes(otherThreadEmojiCode);
	if(!threadClosed && otherThreadClosed) {
		await thread.delete("FORUM SYNC: Deleted as matching thread was found during forum sync.");
		logSyncMessage(salvageCode, `DELETED thread ${thread.id}`, "Matching thread holds closed tag while thread is open");
		return {};
	}
	otherThreadDoc = await redirectSaveSubmissionDoc(otherThreadDoc, thread.id); // Other doc will delete as it no longer has a doc
	logSyncMessage(salvageCode, `REDIRECTED OTHER DOC to thread ${thread.id}`, "Matching thread holds open tag while thread is closed");
	return {thread: thread, threadDoc: otherThreadDoc, starterMessage: starterMessage}; 
}

async function redirectSaveSubmissionDoc(submissionDoc, targetThreadId) {
	submissionDoc.threadId = targetThreadId;
	submissionDoc.status = "TEMP";
	return submissionDoc.save();
}

function logSyncMessage(code, action, reason) {
	console.log(`[${code}] | ${action}.` + (reason ? ` Reason: ${reason}.` : ""));
}

function generateIdTagMap(tags) {
	return new Map(
		tags.filter(tag => VETO_EMOJI_CODES.includes(tag.emoji.name))
			.map(tag => [tag.id, tag])
	);
}

async function getThreadDocMessageAndVideoLink(forum, threadId) {
	const threadDocPromise = Submission.enqueue(() => Submission.findOne({threadId: threadId}).exec());

	let fetchedThread = await forum.threads.fetch(threadId, {force: true});
	if(!fetchedThread) return {};

	let starterMessage;
	try { starterMessage = await fetchedThread.fetchStarterMessage({force: true});
	} catch(ignored) {}
	const videoLink = getVideosFromMessage(starterMessage, false)[0];

	const threadDoc = await threadDocPromise;
	return {fetchedThread: fetchedThread, threadDoc: threadDoc, starterMessage: starterMessage, videoLink: videoLink}
}

async function handleAwaitingVetoThread(fetchedThread, starterMessage, pendingTagId) {
	const count = JUDGEMENT_EMOJI_CODES.reduce(
		(total, emojiCode) => total + starterMessage.reactions.resolve(emojiCode)?.count ?? 0, 
		0
	);
	if(count >= parseInt(process.env.VETO_THRESHOLD + 2)) {
		return handleVetoPending(fetchedThread, pendingTagId, starterMessage);
	}
}

function handlePendingApprovalThread(fetchedThread, threadDoc, starterMessage, pendingTagId) {
	if(this.pendingThreadDocs.has(fetchedThread.id)) return; // Already set up
	if(!threadDoc.expirationTime) return handleVetoPending(fetchedThread, pendingTagId, starterMessage);

	const timeout = threadDoc.expirationTime - Date.now().valueOf(); // Amount of time left
	setTimeout(() => handleVetoJudgement(client, fetchedThread.id), timeout);
	this.pendingThreadDocs.set(fetchedThread.id, threadDoc);
	return;
}

async function handleAwaitingDecisionThread(fetchedThread, starterMessage) {
	const counts = JUDGEMENT_EMOJI_CODES.map(emojiCode => starterMessage.reactions.resolve(emojiCode)?.count ?? 0);
	if(counts[0] > counts[1]) return handleSubmissionApprove(fetchedThread, starterMessage);
	else if (counts[0] < counts[1]) return handleSubmissionReject(fetchedThread);
}

async function matchThreadDocStatus(threadDoc, appliedTagName) {
	const threadStatus = appliedTagName.toUpperCase();
	if(threadDoc.status === threadStatus) return;
				
	threadDoc.status = threadStatus;
	return threadDoc.save();
}