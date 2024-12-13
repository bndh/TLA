require("dotenv").config();
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ThreadAutoArchiveDuration, time, TimestampStyles, channelMention } = require("discord.js");

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
const handleVetoJudgement = require("../../utility/discord/submissionsVeto/handleVetoJudgement");
const submissionLinkExists = require("../../utility/submissionLinkExists");
const youtubeIdRegex = require("../../utility/youtubeIdRegex");
const sumReactions = require("../../utility/discord/reactions/sumReactions");
const linkRegex = require("../../utility/linkRegex");
const getVideoTitle = require("../../utility/getVideoTitle");
const TextFormatter = require("../../utility/TextFormatter");
const createThreadAndReact = require("../../utility/discord/threads/createThreadAndReact");
const sendIndefiniteTyping = require("../../utility/discord/messages/sendIndefiniteTyping");
const { handleNewThread } = require("../../events/messageCreate");
const getTagsFromEmojiCodes = require("../../utility/discord/threads/getTagsFromEmojiCodes");

const JUDGEMENT_EMOJI_CODES = process.env.JUDGEMENT_EMOJI_CODES.split(", ");
const OPEN_EMOJI_CODES = process.env.OPEN_EMOJI_CODES.split(", ");
const VETO_THRESHOLD = parseInt(process.env.VETO_THRESHOLD);

const pendingThreads = new Set();

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
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("deep")
			.setDescription("Whether or not to perform a deep sync. (Default: false).")
			.setRequired(false)
		)
		.addIntegerOption(optionBuilder => optionBuilder
			.setName("max-intake")
			.setDescription("The maximum number of messages to be scanned from #submissions-intake.")
			.setRequired(false)
			.setMinValue(0)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) { 
		// Get options
		const mode = interaction.options.getString("mode", true);
		const deep = interaction.options.getBoolean("deep", false) ?? false;
		const maxIntake = interaction.options.getInteger("max-intake", false) ?? process.env.MAX_INTAKE_SYNC;

		// Notify console
		console.info(`Sync started by User ${interaction.user.id} in Channel ${interaction.channelId} with Mode ${mode} and maxIntake ${maxIntake}`);

		// Send initation text and get initation time/typing flag
		const capitalMode = TextFormatter.capitaliseText(mode);
		await interaction.reply({
			embeds: [
				EmbedBuilder.generateNeutralEmbed(`Starting **${capitalMode}** sync!\nPlease be patient; this may **take a while**...`)
						  .setFooter({text: "Note: Please be patient. If spammed, the bot will explode.", iconURL: "https://images.emojiterra.com/twitter/v14.0/512px/1f4c4.png"})
			],
			ephemeral: false
		});
		const typingFlag = sendIndefiniteTyping(interaction.channel);
		const then = Date.now(); // Used in the concluding response to check how long the sync took

		// Process operation
		if(!deep) {
			// Fetch and lock appropriate channels
			const channelManager = interaction.client.channels;
			const [submissionsIntake, syncForums] = await Promise.all([
				channelManager.fetch(process.env.SUBMISSIONS_INTAKE_ID).then(channel => enableSyncLock(channel, {SendMessages: false})),
				fetchAndLockSyncForums(channelManager) // Sets add reactions to false for all users
			]);
			// const [submissionsIntake, syncForums] = await Promise.all([
			// 	channelManager.fetch(process.env.SUBMISSIONS_INTAKE_ID),
			// 	Promise.all([process.env.SUBMISSIONS_FORUM_ID, process.env.VETO_FORUM_ID].map(id => channelManager.fetch(id)))
			// ]);
			const [submissionsForum, vetoForum] = syncForums;

			// Process channels
			if(mode === "forums") await shallowForumSync(vetoForum, submissionsForum);
			else if(mode === "intake") await shallowIntakeSync(submissionsIntake, submissionsForum, maxIntake);
			else if(mode === "judges") await shallowJudgeSync(submissionsForum, vetoForum);
			else await Promise.all([
					shallowForumSync(vetoForum, submissionsForum),
					shallowIntakeSync(submissionsIntake, submissionsForum, maxIntake),
					shallowJudgeSync(submissionsForum, vetoForum)
			]);

			// Unlock channels
			await Promise.all([
				disableSyncLock(submissionsIntake, {SendMessages: null}),
				syncForums.map(forum => disableSyncLock(forum, {AddReactions: null}))
			]);
		} else {
			interaction.editReply("**Deep** sync is currently **out of service**.");
			return;
		}

		// Respond upon completion
		typingFlag.value = false; // Notify the indefinite typing to stop

		const differenceSeconds = Math.floor((Date.now() - then) / 1000);
		await interaction.followUp({
			embeds: [
				EmbedBuilder.generateSuccessEmbed(`**${capitalMode}** sync **complete** in **${differenceSeconds}s**!`) // Must use followUp because the typing notification only stops when a message is sent
						.setFooter({text: "Note: Do not spam this command, as it is very computationally expensive.", iconURL: "https://images.emojiterra.com/twitter/v14.0/512px/1f4c4.png"})
			],
			ephemeral: false
		});
		console.info(`Sync by User ${interaction.user.id} in Channel ${interaction.channelId} with Mode ${mode} and maxIntake ${maxIntake} has now ended`);
	},
	pendingThreads: pendingThreads
};

async function fetchAndLockSyncForums(channelManager) {
	return Promise.all(
		[process.env.SUBMISSIONS_FORUM_ID, process.env.VETO_FORUM_ID]
			.map(forumId => new Promise(async resolve => { // Defer to separate promise to avoid awaiting on the map method
				const channel = await channelManager.fetch(forumId);
				await enableSyncLock(channel, {AddReactions: false});
				resolve(channel);
			}))
	);
}

function enableSyncLock(channel, permissionField) {
	const lockedName = `${process.env.SYNC_LOCK_TEXT}${channel.name}`;
	return updateChannelNameAndPermissions(channel, lockedName, permissionField);
}

function disableSyncLock(channel, permissionField) {
	const unlockedName = channel.name.slice(process.env.SYNC_LOCK_TEXT.length);
	return updateChannelNameAndPermissions(channel, unlockedName, permissionField);
}

async function updateChannelNameAndPermissions(channel, name, permissionField) {
	await Promise.all([
	//	channel.setName(name), // While it is not essential to wait for the name to change, we do it for clarity during the sync
		channel.permissionOverwrites.edit(channel.guildId, permissionField)
	]);
	
	return channel;
}

async function shallowForumSync(vetoForum, submissionsForum) {
	await shallowVetoSync(vetoForum);
	await shallowSubmissionsSync(submissionsForum);
}

async function shallowIntakeSync(intakeChannel, submissionsForum, maxIntake) {
	const waitingTagId = getTagByEmojiCode(submissionsForum, OPEN_EMOJI_CODES[0]).id;
	const messages = await fetchMessages(intakeChannel, maxIntake);

	for(const message of messages) { // Must do synchronously to avoid duplicate threads
		const videoLinks = getVideosFromMessage(message);
		for(const videoLink of videoLinks) {
			if(await submissionLinkExists(videoLink)) continue;

			await handleNewThread(submissionsForum, waitingTagId, videoLink); // Creates the thread and updates Submissions
		}
	}
}

async function shallowJudgeSync(submissionsForum, vetoForum) {
	const judgeGroups = await Promise.all(["nominator", "assessor", "admin"].map(judgeType => Judge.enqueue(() => Judge.find({judgeType: {$in: judgeType}}).exec())));
	const judgeIdMaps = judgeGroups.map(judgeGroup => new Map(judgeGroup.map(judge => [judge.userId, {counselled: [], closed: 0}])))

	await Promise.all([
		judgeSyncForum(submissionsForum, judgeIdMaps[2]), // Pushing asynchronously is safe in JS so this works fine
		judgeSyncForum(vetoForum, ...judgeIdMaps)
	]);
	
	return Promise.all(judgeIdMaps.map(judgeIdMap => syncJudgeDocsFromMap(judgeIdMap)));
}

async function shallowVetoSync(vetoForum) {
	const threads = await getAllThreads(vetoForum);
	const specialTags = getTagsFromEmojiCodes(vetoForum, [...JUDGEMENT_EMOJI_CODES, OPEN_EMOJI_CODES[1]], true).map(tag => tag.id);
	return Promise.all([threads.map(thread => shallowSyncVetoThread(thread, ...specialTags))]);
}

const handleVetoPending = require("../../utility/discord/submissionsVeto/handleVetoPending"); // Circular dependency
async function shallowSyncVetoThread(thread, approvedTagId, deniedTagId, pendingTagId) {
	if(thread.appliedTags.some(tagId => tagId === approvedTagId || tagId === deniedTagId)) return;

	const videoMessage = await thread.fetchStarterMessage({force: true});

	if(thread.appliedTags.includes(pendingTagId)) {
		const doc = await Submission.enqueue(() => Submission.findOne({threadId: thread.id}).exec());
		console.log(`${doc} for ${thread.id}`)
		if(doc.expirationTime <= Date.now()) return handleVetoJudgement(thread.client, thread.id);
	} else { // Thread is not closed or pending
		const [upvotes, downvotes] = tallyReactions(videoMessage, JUDGEMENT_EMOJI_CODES);
		if(upvotes + downvotes >= VETO_THRESHOLD + 2) { // +2 as the bot reacts twice to any sent message
			return handleVetoPending(thread, pendingTagId, videoMessage, videoMessage.cleanContent.trim());	
		}
	}
}

async function shallowSubmissionsSync(submissionsForum) {
	const threads = await getAllThreads(submissionsForum);
	const closedTagIds = getTagsFromEmojiCodes(submissionsForum, JUDGEMENT_EMOJI_CODES).map(tag => tag.id);
	return Promise.all([threads.map(thread => shallowSyncSubmissionsThread(thread, closedTagIds))])
}

async function shallowSyncSubmissionsThread(thread, closedTagIds) {
	if(thread.appliedTags.some(tagId => closedTagIds.includes(tagId))) return;
	
	const videoMessage = await thread.fetchStarterMessage({force: true});

	const [upvotes, downvotes] = tallyReactions(videoMessage, JUDGEMENT_EMOJI_CODES);
	if(upvotes > downvotes) { // Easiest check
		return handleSubmissionApprove(thread, videoMessage);
	} else if(upvotes < downvotes) {
		return handleSubmissionReject(thread);
	}
}

async function judgeSyncForum(forum, ...judgeIdMaps) {
	const threads = await getAllThreads(forum);
	const closedTagIds = getTagsFromEmojiCodes(forum, JUDGEMENT_EMOJI_CODES).map(tag => tag.id);
	await Promise.all(threads.map(thread => pushJudgedFromThread(judgeIdMaps, thread, closedTagIds))); // Pushing asynchronously is safe in JS
}

async function pushJudgedFromThread(judgeIdMaps, thread, closedTagIds) {
	const videoMessage = await thread.fetchStarterMessage({force: true});

	JUDGEMENT_EMOJI_CODES.forEach(emojiCode => { if(videoMessage.reactions.resolve(emojiCode) === null) { console.log(thread.id) }});

	const reactedUserIds = await getReactedUserIds(videoMessage, JUDGEMENT_EMOJI_CODES);
	const threadClosed = thread.appliedTags.some(appliedTagId => closedTagIds.includes(appliedTagId))

	for(const userId of reactedUserIds) {
		const map = judgeIdMaps.find(idMap => idMap.get(userId)); // Must find which map the user belongs to, in this case nominator, assessor or admin
		const judged = map?.get(userId);
		if(!judged) continue;

		if(threadClosed) judged.closed++;
		else judged.counselled.push(thread.id);
	}
}

async function syncJudgeDocsFromMap(judgeIdMap) {
	return Promise.all(Array.from(
		judgeIdMap.entries(),
		([judgeId, {counselled, closed}]) => Judge.enqueue(() => Judge.updateOne({userId: judgeId}, {counselledSubmissionIds: counselled, totalSubmissionsClosed: closed}))
	));
}



// async function forumsSetupAndSync(channelManager) {
// 	let promisedChannels = await Promise.all([
// 		channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID), 
// 		channelManager.fetch(process.env.VETO_FORUM_ID)
// 	]);
// 	await handleForumsSync(promisedChannels[0], promisedChannels[1]);
// }

// async function handleForumsSync(submissionsForum, vetoForum) {
// 	console.info("==> STARTING FORUM SYNC");
// 	// const vetoThreadPromise = getAllThreads(vetoForum);
// 	// const submissionsThreadPromise = getAllThreads(submissionsForum);
// 	console.info("Syncing Veto...");
// 	await handleVetoSyncFinal(vetoForum);
// 	console.info("Syncing Submissions...");
// 	// await handleSubmissionSync(submissionsForum, await submissionsThreadPromise);
// 	//await handleSubmissionSync2(submissionsForum, vetoForum);
// 	console.info("==> FINISHED FORUM SYNC");
// }

// async function intakeSetupAndSync(channelManager) {
// 	console.info("==> STARTING INTAKE SYNC");
// 	promisedChannels = await Promise.all([
// 		channelManager.fetch(process.env.SUBMISSIONS_INTAKE_ID), 
// 		channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID)]);
// 	await handleIntakeSync(promisedChannels[0], promisedChannels[1], maxIntake); // TODO maxIntake missing?
// 	console.info("==> FINISHED INTAKE SYNC");
// }

// async function handleIntakeSync(intakeChannel, submissionsForum, maxIntake) {
// 	const initialMessages = await fetchMessages(intakeChannel, maxIntake);
// 	for(const initialMessage of initialMessages) {
// 		const message = await intakeChannel.messages.fetch(initialMessage.id);

// 		const videoLinks = getVideosFromMessage(message);
// 		for(const videoLink of videoLinks) {
// 			if(await submissionLinkExists(videoLink)) continue;

// 			const thread = (await createReactedThreadsFromVideos([videoLink], submissionsForum))[0];
// 			Submission.enqueue(() => Submission.create({
// 				threadId: thread.id, 
// 				videoLink: videoLink, 
// 				status: "AWAITING DECISION"
// 			}));
// 			Judge.enqueue(() => Judge.updateMany({}, {$push: {unjudgedThreadIds: thread.id}}).exec());
// 		}
// 	}
// }

// async function judgeSetupAndSync(channelManager) {
// 	console.info("==> STARTING JUDGE SYNC");
// 	let promisedChannels = await Promise.all([
// 		channelManager.fetch(process.env.SUBMISSIONS_FORUM_ID), 
// 		channelManager.fetch(process.env.VETO_FORUM_ID)
// 	]);
// 	await handleJudgeSync(promisedChannels[0], promisedChannels[1]); 
// 	console.info("==> FINISHED JUDGE SYNC");
// }

// async function handleJudgeSync(submissionsForum, vetoForum) {
// 	const judgeSyncPromises = Array(2);
// 	judgeSyncPromises[0] = await updateJudges("nominator", [vetoForum]);
// 	judgeSyncPromises[1] = await updateJudges("admin", [vetoForum, submissionsForum])
// 	await Promise.all(judgeSyncPromises);
// }

// const VETO_SALVAGE_CODE = "SaV";
// const SUBMISSIONS_SALVAGE_CODE = "SaS";
// const VETO_SYNC_CODE = "SyV";
// const SUBMISSIONS_SYNC_CODE = "SyS";
// const JUDGE_SYNC_CODE = "SyJ";

// async function e(forumJudgeTypeMap, judgeTypes) {
// 	const judgeTypeMap = new Map( // Map(judgeTypes => Map(judgeIds => judges))
// 		await Promise.all(judgeTypes.map(judgeType =>
// 			new Promise(async resolve => {
// 				const typedJudges = await Judge.enqueue(() => Judge.find({judgeType: judgeType}));
// 				const judgeIdMap = new Map(typedJudges.map(judge => {
// 					judge.counselledSubmissionIds = [];
// 					judge.totalSubmissionsClosed = 0;
// 					return [judge.userId, judge];
// 				}));
// 				resolve([judgeType, judgeIdMap]);
// 			})
// 		))
// 	);

// 	const idMaps = await Promise.all(
// 		[...forumJudgeTypeMap.entries()].map(async entry => {
// 			const forumJudgeTypes = entry[1];
// 			const judgeIdMap = new Map(forumJudgeTypes.flatMap(judgeType => [...judgeTypeMap.get(judgeType)]));
// 			return pushCounselledClosedSubmissions(entry[0], judgeIdMap);
// 		}
// 	));
// 	console.log("out");
// 	const iter = idMaps.values();
// 	while((data = iter.next().value) !== undefined) {
// 		console.log(data);
// 	}
// }

// async function pushCounselledClosedSubmissions(forum, judgeIdMap) {
// 	const openTagIds = OPEN_EMOJI_CODES.map(emojiCode => getTagByEmojiCode(forum, emojiCode));
// 	console.log("getting " + forum.id);
// 	const bulkThreads = await getAllThreads(forum);
// 	console.log("got " + bulkThreads.size + " threads");
// 	const iter = judgeIdMap.values();
// 	while((data = iter.next().value) !== undefined) {
// 		data.totalSubmissionsClosed += bulkThreads.size;
// 	}
// 	return judgeIdMap;
// 	// for(const cachedThread of bulkThreads) {
// 	// 	const fetchedThread = await forum.threads.fetch(cachedThread);
// 	// 	if(!cachedThread) continue;

// 	// 	const starterMessage = await fetchedThread.fetchStarterMessage({cache: false});
// 	// 	const reactedUserIds = await getReactedUserIds(starterMessage, JUDGEMENT_EMOJI_CODES);

// 	// 	const open = openTagIds.some(closedTag => fetchedThread.appliedTags.includes(closedTag));
// 	// 	for(const userId of reactedUserIds) {
// 	// 		const judge = judgeIdMap.get(userId);
// 	// 		if(!judge) continue;

// 	// 		if(open) judge.counselledSubmissionIds.push(fetchedThread.id);
// 	// 		else judge.totalSubmissionsClosed++;
// 	// 	}
// 	// }
// }

// async function updateJudges(judgeType, forums) {
// 	const judgeMap = new Map();
// 	const judges = await Judge.enqueue(() => Judge.find({judgeType: judgeType}).select({userId: 1, _id: 0}).exec());

// 	for(const judge of judges) {
// 		judgeMap.set(judge.userId, []);
// 	}

// 	for(const forum of forums) {
// 		const judgedTagIds = [
// 			getTagByEmojiCode(forum, JUDGEMENT_EMOJI_CODES[0]).id,
// 			getTagByEmojiCode(forum, JUDGEMENT_EMOJI_CODES[1]).id
// 		];

// 		const initialThreads = await getAllThreads(forum);
// 		for(const initialThread of initialThreads.values()) {
// 			const fetchedThread = await forum.threads.fetch(initialThread);
// 			if(!fetchedThread) continue;
// 			if(fetchedThread.appliedTags.some((appliedTag => judgedTagIds.includes(appliedTag)))) continue;

// 			const starterMessage = await fetchedThread.fetchStarterMessage({cache: false, force: true}); // Reactions may not be cached so we force
// 			const reactedUserIds = await getReactedUserIds(starterMessage, JUDGEMENT_EMOJI_CODES);

// 			for(const judgeId of judgeMap.keys()) {
// 				if(reactedUserIds.includes(judgeId)) continue;
// 				judgeMap.get(judgeId).push(fetchedThread.id);	
// 			}
// 		}
// 	}

// 	for(const judgeId of judgeMap.keys()) {
// 		Judge.enqueue(() => Judge.updateOne({userId: judgeId}, {unjudgedThreadIds: judgeMap.get(judgeId)}).exec());
// 	}
// }






// const VETO_EMOJI_CODES = new Set(JUDGEMENT_EMOJI_CODES.concat(OPEN_EMOJI_CODES));
// const CLOSED_VETO_STATUSES = new Set(["APPROVED", "VETOED"]);
// const VETO_STATUSES = ["APPROVED", "VETOED", "AWAITING VETO", "PENDING APPROVAL"];

// async function handleVetoSyncSuperFinal(vetoForum) {
// 	let threadBulk = getAllThreads(vetoForum);
	
// 	const evaluatedThreadIds = new Set(); // Every thread that has been/will be evaluated; necessary because finding one thread will fetch all competitor thread docs
// 	const videoIdEvaluations = new Map(); // Every video that has been/will be evaluated -> Promise object representing this process; if a thread/doc without its thread/doc counterpart is found it should await its competitor's evaluation
// 	const completionPromises = []; // Other promises that are not appropriate for videoIdEvaluations

// 	const idTagMap = generateIdTagMap(vetoForum.availableTags, VETO_EMOJI_CODES); // thread.appliedTags() returns ids, so this map is in place to get more information out of those ids efficiently
// 	const statusTagMap = generateStatusTagMap(vetoForum.availableTags, VETO_STATUSES); // doc.status has no default mapping to forum tags, so this map is in place to bridge that gap
// 	const pendingTagId = vetoForum.availableTags.find(tag => tag.name === "Pending Approval").id; // Used for assigning threads as pending
// 	const waitingTagId = vetoForum.availableTags.find(tag => tag.name === "Awaiting Veto").id; // Used for creating new threads when necessary

// 	threadBulk = await threadBulk;
// 	for(const bulkedThread of threadBulk.values()) {
// 		// Check if already synced
// 		if(evaluatedThreadIds.has(bulkedThread.id)) {
// 			TextFormatter.logInfoMessage(VETO_SYNC_CODE, `Bypassing sync on Thread ${bulkedThread.id}`, "Already synced");
// 			continue;
// 		}

// 		// Declare sync attempt
// 		logSyncMessage(VETO_SYNC_CODE, `Attempting sync on Thread ${bulkedThread.id}`);

// 		// Get thread and doc
// 		let {
// 			thread: primaryThread, doc: primaryDoc, 
// 			starterMessage, videoLink // Components that _may_ be fetched if issues with the primaryThread/primaryDoc occur (no reason to re-fetch them)
// 		} = await ensureGetThreadFundamentals(bulkedThread.id, vetoForum, statusTagMap, waitingTagId);

// 		const videoId = (youtubeMatch = videoLink.match(youtubeIdRegex)) ? youtubeMatch[1] : undefined; // Used in videoIdEvaluation

// 		if(!primaryThread || !primaryDoc || !videoLink) { // Could not ensure
// 			const deletionPromise = deleteThreadDetails(primaryThread, primaryDoc);
// 			videoIdEvaluations.set(videoId, deletionPromise); // In both instances of incomplete threadDetails, an attempt at finding an appropriate videoLink is made, and so we do not need to search here
// 			completionPromises.push(deletionPromise); // If we could not find a video link here, no other thread evaluation will be able to find this thread, meaning it's not a problem that we don't set it in videoIdEvaluations

// 			TextFormatter.logInfoMessage(VETO_SYNC_CODE, `Aborting sync on and deleting details of Thread ${bulkedThread.id}`, "Could not establish proper thread or doc information");
// 			continue;
// 		}

// 		// Get competitors
// 		const videoOrConditions = [{videoLink: videoId ? {$regex: videoId} : videoLink}]; // The video Id allows us to search for more competitors than a simple video link would (using regex)
// 		if(primaryThread.name !== "New Submission!") videoOrConditions.push({videoTitle: primaryThread.name}); // Can also match the title itself
		
// 		const competingDocs = await Submission.enqueue(() => Submission.find({
// 			threadId: {$ne: thread.id},
// 			status: {$in: VETO_STATUSES},
// 			$or: videoOrConditions
// 		}).exec()); // Find thread docs with the same video link, hence "competing"

// 		if(competingDocs.length >= 1) {
// 			// Map docs to threads
			

// 			// Identify prime competitor
			

// 			// Delete remnants
			
		
// 		}
// 	}
// }

// async function ensureGetThreadFundamentals(threadId, forum, statusTagMap, defaultTagId) {
// 	// Fetch base components
// 	let [thread, doc] = await Promise.all([
// 		forum.threads.fetch(threadId).catch(_ => undefined),
// 		Submission.enqueue(() => Submission.findOne({threadId: threadId}).exec())
// 	]);
// 	let starterMessage, videoLink; // Presence/absence of these variables may be used as flags

// 	// Salvage fundamentals
// 	if(thread && !doc) {
// 		starterMessage = await thread.fetchStarterMessage({force: true});
// 		if(!starterMessage) return {thread: thread}; // No purpose in creating a new doc if the thread's video link is incorrect
		
// 		const linkMatch = starterMessage.cleanContent.match(linkRegex);
// 		if(!linkMatch) return {thread: thread};
// 		videoLink = linkMatch[0];

// 		doc = await Submission.enqueue(() => Submission.create({threadId: threadId, videoLink: "TEMP", status: "TEMP"}));
// 	} else if(!thread && doc) {
// 		const linkMatch = doc.videoLink.match(linkRegex);
// 		if(!linkMatch) return {doc}; // No purpose in creating a new thread if the doc's video link is invalid

// 		thread = await createThreadFromDoc(doc, forum, statusTagMap, defaultTagId); // doc will be redirected later on, if the specified thread is the successor
// 		videoLink = linkMatch[0];
// 		starterMessage = await thread.fetchStarterMessage({force: true});
// 	} else if(thread && doc) {
// 		let linkMatch;

// 		starterMessage = await thread.fetchStarterMessage({force: true}); // Must fetch eventually so no harm fetching here
// 		if(starterMessage) linkMatch = starterMessage.cleanContent.match(linkRegex);
		
// 		if(!linkMatch) linkMatch = doc.videoLink.match(linkRegex);
		
// 		videoLink = linkMatch ? linkMatch[0] : undefined;
// 	}
	
// 	if(!starterMessage) {
// 		thread = await createThreadFromDetails(thread, doc, videoLink, forum, statusTagMap, waitingTagId);
// 		starterMessage = await thread.fetchStarterMessage({force: true});
// 	}

// 	// Return
// 	return {thread: thread, doc: doc, starterMessage: starterMessage, videoLink: videoLink};
// }

// function deleteThreadDetails(thread, doc) {
// 	const deletionPromises = []; 
// 	if(thread) deletionPromises.push(thread.delete()); // Leave no trace
// 	if(doc) deletionPromises.push(Submission.enqueue(() => Submission.deleteOne({_id: doc._id}).exec()));
// 	return Promise.all([deletionPromises]);
// }

// function getVideoLink(starterMessage, doc) {
// 	let linkMatch = starterMessage.content.match(linkRegex);
// 	if(linkMatch) return linkMatch[0];

// 	linkMatch = doc.videoLink.match(linkRegex);
// 	if(linkMatch) return linkMatch[0];
// }

// async function createThreadFromDoc(doc, forum, statusTagMap, defaultTagId) {
// 	if(!doc.videoLink) return;
// 	const linkMatch = doc.videoLink.match(linkRegex);
// 	if(!linkMatch) return;
// 	const videoLink = linkMatch[0];

// 	const tagId = (tag = statusTagMap.get(doc.status)) ? tag.id : defaultTagId;
	
// 	return createThreadAndReact(forum, {
// 		name: doc.videoTitle ?? "New Submission!", 
// 		message: videoLink, 
// 		appliedTags: [tagId], 
// 		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek
// 	});
// }

// async function createThreadFromDetails(thread, doc, videoLink, forum, statusTagMap, defaultTagId) {
// 	const statusTag = thread.appliedTags[0] ?? statusTagMap.get(docStatus);
// 	const statusTagId = statusTag ? statusTag.id : defaultTagId;

// 	return createThreadAndReact(forum, {
// 		name: doc.videoTitle ?? thread.name ?? "New Submission!", 
// 		message: videoLink, 
// 		appliedTags: [statusTagId], 
// 		autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek
// 	});
// }



// async function handleVetoSyncFinal(vetoForum) {
// 	const checkedThreadIds = new Set();
// 	const checkedVideoIds = new Map();
// 	const evaluationPromises = [];

// 	const idTagMap = generateIdTagMap(vetoForum.availableTags, VETO_EMOJI_CODES);
// 	const statusTagMap = generateStatusTagMap(vetoForum.availableTags, VETO_STATUSES);
// 	const pendingTagId = vetoForum.availableTags.find(tag => tag.name === "Pending Approval").id;
// 	const waitingTagId = vetoForum.availableTags.find(tag => tag.name === "Awaiting Veto").id;

// 	const threadBulk = await getAllThreads(vetoForum);
// 	for(const bulkedThread of threadBulk.values()) {
// 		if(checkedThreadIds.has(bulkedThread.id)) {
// 			logSyncMessage(VETO_SYNC_CODE, `Bypassing sync on Thread ${bulkedThread.id}`, "Already synced");	
// 			continue;
// 		}
// 		logSyncMessage(VETO_SYNC_CODE, `Attempting sync on Thread ${bulkedThread.id}`);

// 		let fetchedThreadDoc = await Submission.enqueue(() => Submission.findOne({threadId: bulkedThread.id}).exec());
// 		if(!fetchedThreadDoc) {
// 			logSyncMessage(VETO_SYNC_CODE, `Creating Doc for Thread ${bulkedThread.id}`, "Did not have one previously");
// 			fetchedThreadDoc = await Submission.enqueue(() => Submission.create({
// 				threadId: bulkedThread.id,
// 				videoLink: "TEMP",
// 				status: "TEMP"
// 			}));
// 		}
// 		const fetchedThreadData = await constructThreadData(
// 			vetoForum, 
// 			bulkedThread.id, fetchedThreadDoc, 
// 			waitingTagId, idTagMap, statusTagMap, 
// 			evaluationPromises, 
// 			VETO_SYNC_CODE
// 		);
// 		if(!fetchedThreadData) return;

// 		const youtubeMatch = fetchedThreadData.videoLink.match(youtubeIdRegex);
// 		const linkId = youtubeMatch ? youtubeMatch[1] : fetchedThreadData.videoLink; // Added to checkedVideoIds later

// 		const videoOrConditions = [{videoLink: youtubeMatch ? {$regex: youtubeMatch[1]} : fetchedThreadData.videoLink}];
// 		if(fetchedThreadData.thread.name !== "New Submission!") videoOrConditions.push({videoTitle: fetchedThreadData.thread.name});
// 		const competingThreadDocs = await Submission.enqueue(() => Submission.find({
// 			threadId: {$ne: fetchedThreadData.thread.id},
// 			status: {$in: VETO_STATUSES},
// 			$or: videoOrConditions
// 		}).exec()); // Find thread docs with the same video link, hence "competing"

// 		let linkEvaluationPromise = checkedVideoIds.get(linkId); // Must declare outside promise or else may get self (set self later)
// 		const threadSyncPromise = new Promise(async resolve => {
// 			if(linkEvaluationPromise) { // Need constructed threadData to proceed anyway so making this check here is OK
// 				logSyncMessage(VETO_SYNC_CODE, `Awaiting Evaluation Promise for Thread ${fetchedThreadData.thread.id}'s ${fetchedThreadData.videoLink}`);
// 				await linkEvaluationPromise; // Consolidates other threadDocs, etc., so we need to wait for it before fetching competing thread docs
// 				logSyncMessage(VETO_SYNC_CODE, `Proceeding sync on Thread ${fetchedThreadData.thread.id}`, `Link ${fetchedThreadData.videoLink}'s Evaluation Promise resolved`);
// 			}

// 			await syncVetoThreads(fetchedThreadData, competingThreadDocs, vetoForum, idTagMap, statusTagMap, pendingTagId, evaluationPromises);
// 			resolve();
// 		});

// 		checkedThreadIds.add(fetchedThreadData.thread.id);
// 		competingThreadDocs.forEach(threadDoc => checkedThreadIds.add(threadDoc.threadId));
// 		checkedVideoIds.set(linkId, threadSyncPromise);
// 	}

// 	const unprocessedDocs = await findUnprocessedDocs(checkedVideoIds);
// 	logSyncMessage(VETO_SYNC_CODE, `Found ${unprocessedDocs.length} unprocessed Docs`);
// 	for(const threadDoc of unprocessedDocs) { // TODO separate routine for no.1
// 		logSyncMessage(VETO_SYNC_CODE, `Attempting sync on Doc ${threadDoc._id}`);
// 		if(!threadDoc.videoLink.match(linkRegex)) {
// 			logSyncMessage(VETO_SYNC_CODE, `Aborting sync on Doc ${threadDoc._id}`, "Video link was improper");
// 			continue; // Will delete later as its threadId will not be added to the set
// 		}; 
	
// 		const youtubeMatch = threadDoc.videoLink.match(youtubeIdRegex);
// 		const linkId = youtubeMatch ? youtubeMatch[1] : threadDoc.videoLink; // Added to checkedVideoIds later
// 		const linkEvaluationPromise = checkedVideoIds.get(linkId); // TODO: Not necessary for first check

// 		const threadSyncPromise = new Promise(async resolve => {
// 			if(linkEvaluationPromise) {
// 				logSyncMessage(VETO_SYNC_CODE, `Awaiting Evaluation Promise for Doc ${threadDoc._id}'s ${threadDoc.videoLink}`);
// 				await linkEvaluationPromise; // Consolidates other threadDocs, etc., so we need to wait for it before fetching competing thread docs
// 				logSyncMessage(VETO_SYNC_CODE, `Proceeding sync on Doc ${threadDoc._id}`, `Link ${threadDoc.videoLink}'s Evaluation Promise resolved`);
// 			}

// 			const statusTag = statusTagMap.get(threadDoc.status);
// 			if(!statusTag) {
// 				logSyncMessage(VETO_SYNC_CODE, `Assigning Doc ${threadDoc._id}'s status to AWAITING VETO`, "Previous status was improper");
// 				threadDoc.status = "AWAITING VETO"; // TODO:  Generify
// 			}

// 			const videoTitle = await getVideoTitle(threadDoc.videoLink);
// 			if(videoTitle) threadDoc.videoTitle = videoTitle;
// 			const thread = await vetoForum.threads.create({
// 				name: videoTitle ?? "New Submission!", 
// 				message: threadDoc.videoLink,
// 				appliedTags: [statusTag.id ?? waitingTagId]
// 			});
// 			const starterMessage = await thread.fetchStarterMessage();
// 			await addReactions(starterMessage);
// 			logSyncMessage(VETO_SYNC_CODE, `Created Thread ${thread.id} for Doc ${threadDoc._id}, "Doc was unprocessed and could be salvaged"`);
// 			checkedThreadIds.add(thread.id);

// 			threadDoc.threadId = thread.id;
// 			await Submission.enqueue(() => threadDoc.save()); // Must await before handling veto pending or accurate thread information will not be saved

// 			if(statusTag === "PENDING APPROVAL") {
// 				await handleVetoPending(thread, pendingTagId, starterMessage, threadDoc.videoLink);
// 			}
// 			resolve();
// 		});
// 		checkedVideoIds.set(linkId, threadSyncPromise);
// 	}

// 	await Promise.all(evaluationPromises);
// 	await Promise.all(checkedVideoIds.values());

// 	await Submission.enqueue(() => Submission.deleteMany({threadId: {$nin: Array.from(checkedThreadIds)}}).exec());
// }

// async function syncVetoThreads(
// 	keyThreadData, competingThreadDocs,
// 	vetoForum, idTagMap, statusTagMap, pendingTagId,
// 	evaluationPromises
// ) {
// 	let finalistVetoThreadData;
// 	if(competingThreadDocs.length > 0) {
// 		logSyncMessage(VETO_SYNC_CODE, `Found ${competingThreadDocs.length} Competitors for Thread ${keyThreadData.thread.id}`);

// 		const competingVetoData = [];
// 		const enumerationPromises = new Array(competingThreadDocs.length);
// 		for(let i = 0; i < competingThreadDocs.length; i++) {
// 			enumerationPromises[i] = new Promise(async (resolve) => {
// 				const threadDoc = competingThreadDocs[i];
// 				try {
// 					const thread = await fetchThread(vetoForum, threadDoc.threadId); // Throws, not worth evaluating the rest if it if no thread
// 					const threadData = await extractDataFromThread(thread, threadDoc, idTagMap, evaluationPromises, VETO_SYNC_CODE); // Throws
// 					competingVetoData.push(threadData);
// 				} catch(notFound) {
// 					evaluationPromises.push(Submission.enqueue(() => Submission.deleteOne({_id: threadDoc._id})));
// 				} // Technically an issue but no cleanup is necessary so reject isn't either
// 				resolve();
// 			});
// 		}
// 		await Promise.all(enumerationPromises);
		
// 		competingVetoData.push(keyThreadData);

// 		competingVetoData.forEach(threadData => validateVetoStatus(threadData)); // Make sure status is accurate for unification
// 		finalistVetoThreadData = await unifyCompetingThreads(competingVetoData, CLOSED_VETO_STATUSES, VETO_SYNC_CODE, keyThreadData.thread.id);
// 	} else {
// 		validateVetoStatus(keyThreadData);
// 		finalistVetoThreadData = keyThreadData;
// 	}
	
// 	return evaluateVetoThreadData(finalistVetoThreadData, vetoForum, statusTagMap, idTagMap, pendingTagId);
// }

// async function constructThreadData(forum, threadId, threadDoc, waitingTagId, idTagMap, statusTagMap, evaluationPromises, syncCode) {
// 	let thread;
// 	try { thread = await fetchThread(forum, threadId); } 
// 	catch(notFound) {
// 		if(!threadDoc) return;
// 		await createThreadFromDoc(threadDoc, forum, waitingTagId, statusTagMap); // Preserve all data
// 		logSyncMessage(syncCode, `Creating new Thread for Doc ${threadDoc._id}`, `Could not find ${threadId} in Forum ${forum.id}`);
// 	}

// 	return await extractDataFromThread(thread, threadDoc, idTagMap, evaluationPromises, syncCode);
// }

// async function extractDataFromThread(thread, threadDoc, idTagMap, evaluationPromises, syncCode) {
// 	let starterMessage, reactionCounts, reactionTotal;
// 	try { 
// 		({starterMessage, reactionCounts, reactionTotal} = await fetchStarterMessageAndCounts(thread)); 
// 	} catch(notFound) {
// 		logSyncMessage(syncCode, `Could not find Starter Message for Thread ${thread.id}`);
// 		reactionCounts = []; // While it will be [1, 1]/2 total when a new starter message is created, it would be preferable to pick a thread which already has its starter message as it does not require an additional wait
// 		reactionTotal = 0;
// 	}; // Create new starter message later

// 	let videoLink;
// 	try { videoLink = getVideoLink(starterMessage, threadDoc); }
// 	catch(noVideoLink) {
// 		evaluationPromises.push([
// 			thread.delete(generateSyncMessage(syncCode, "Could not find an associated video link")),
// 			Submission.enqueue(() => Submission.deleteOne({threadId: thread.id}).exec())
// 		]);
// 		logSyncMessage(syncCode, `Deleting Thread ${thread.id}`, "Could not find an associated video link");
// 		return;
// 	}

// 	let status;
// 	try { status = getThreadStatus(thread, idTagMap); } 
// 	catch(noTag) { status = threadDoc.status; } // Deal with undefined later

// 	return {thread: thread, starterMessage: starterMessage, videoLink: videoLink, status: status, reactionCounts: reactionCounts, reactionTotal: reactionTotal, threadDoc: threadDoc};
// }

// async function fetchThread(forum, threadId) {
// 	const thread = await forum.threads.fetch(threadId);
// 	if(thread.parentId !== forum.id) throw new Error("Mismatched forum");
// 	return thread;
// }



// async function fetchStarterMessageAndCounts(thread) {
// 	starterMessage = await thread.fetchStarterMessage({force: true});
// 	reactionCounts = tallyReactions(starterMessage, JUDGEMENT_EMOJI_CODES);
// 	reactionTotal = reactionCounts.reduce((total, count) => total + count ?? 0);
// 	return {starterMessage: starterMessage, reactionCounts: reactionCounts, reactionTotal, reactionTotal};
// }

// function getThreadStatus(thread, idTagMap) {
// 	return idTagMap.get(thread.appliedTags[0]).name.toUpperCase();
// }

// function getVideoLink(starterMessage, threadDoc) {
// 	let videoLink = getVideosFromMessage(starterMessage, false)[0];
// 	if(!videoLink) {
// 		videoLink = threadDoc.videoLink.match(linkRegex)[0]; // fetchedThreadDoc.videoLink may be undefined
// 		if(!videoLink) throw new Error("No video link");
// 	}
// 	return videoLink;
// }

// function validateVetoStatus(threadData) {
// 	if(threadData.status === "AWAITING VETO") {
// 		if(threadData.reactionTotal >= VETO_THRESHOLD + 2) threadData.status = "PENDING APPROVAL";
// 	} else if(Date.now() >= threadData.threadDoc.expirationTime) { // Presence of expiration time implies pending approval status
// 		if(reactionCounts[0] >= reactionCounts[1]) threadData.status = "APPROVED";
// 		else threadData.status = "VETOED";
// 	} else if(threadData.status === undefined) {
// 		threadData.status = "AWAITING VETO";
// 	}
// 	return threadData;
// }

// async function unifyCompetingThreads(competingThreadData, closedStatuses, syncCode, keyThreadId) { // TODO Does this work for submissions?
// 	let closedThreadData, openThreadData;
// 	[closedThreadData, openThreadData] = competingThreadData.reduce(([closedThreadData, openThreadData], threadData) => {
// 		if(closedStatuses.has(threadData.status)) closedThreadData.push(threadData);
// 		else openThreadData.push(threadData);	
// 		return [closedThreadData, openThreadData];
// 	}, [[], []]);

// 	logCompetitorSyncMessage(syncCode, keyThreadId, closedThreadData, "Closed");
// 	logCompetitorSyncMessage(syncCode, keyThreadId, openThreadData, "Open");
	
// 	if(closedThreadData.length !== 0) {
// 		const excessDeletionPromises = new Array(openThreadData.length + closedThreadData.length - 1);
// 		for(let i = 0; i < openThreadData.length; i++) {
// 			const deletionMessage = generateSyncMessage(VETO_SYNC_CODE, `Deleting Thread ${keyThreadId.id}`, "Found Closed Competitor while Thread was Open");
// 			excessDeletionPromises[i] = openThreadData[i].thread.delete(deletionMessage);
// 			console.log(deletionMessage);
// 		}

// 		closedThreadData = closedThreadData.sort((dataA, dataB) => dataB.reactionTotal - dataA.reactionTotal);
// 		for(let i = 1; i < closedThreadData.length; i++) {
// 			const deletionMessage = generateSyncMessage(VETO_SYNC_CODE, `Deleting Thread ${keyThreadId.id}`, "Found even-status Competitor with the same/more votes");
// 			excessDeletionPromises[openThreadData.length + i - 1] = closedThreadData[i].thread.delete(deletionMessage);
// 			console.log(deletionMessage);
// 		}
		
// 		const deletedThreadData = closedThreadData.slice(1).concat(openThreadData);
// 		await Promise.all([
// 			excessDeletionPromises,
// 			Submission.enqueue(() => 
// 				Submission.deleteMany({_id: {
// 					$in: deletedThreadData.map(threadData => threadData.threadDoc._id)
// 				}}).exec()
// 			)
// 		]);

// 		logSyncMessage(
// 			syncCode, 
// 			`Deleted Threads [${TextFormatter.listItems(deletedThreadData.map(threadData => threadData.thread.id))}] and their Docs`, 
// 			`Found ${closedThreadData[0].thread.id} as Optimal Competitor with ${closedThreadData[0].reactionTotal} votes`
// 		);
// 		return closedThreadData[0];
// 	}

// 	openThreadData.sort((dataA, dataB) => dataB.reactionTotal - dataA.reactionTotal);
// 	const excessDeletionPromises = new Array(openThreadData.length - 1);
// 	for(let i = 1; i < openThreadData.length; i++) {
// 		const syncMessage = generateSyncMessage(VETO_SYNC_CODE, `Deleting Thread ${keyThreadId.id}`, "Thread had less votes than Competitor");
// 		excessDeletionPromises[i - 1] = openThreadData[i].thread.delete(syncMessage);
// 	}
// 	await Promise.all([
// 		excessDeletionPromises,
// 		Submission.enqueue(() => 
// 			Submission.deleteMany({_id: {$in: openThreadData.slice(1).map(threadData => threadData.threadDoc._id)}})
// 					  .exec()
// 		)
// 	]);

// 	logSyncMessage(
// 		syncCode, 
// 		`Deleted Threads [${TextFormatter.listItems(openThreadData.slice(1).map(threadData => threadData.thread.id))}] and their Docs`, 
// 		`Found ${openThreadData[0].thread.id} as Optimal Competitor with ${openThreadData[0].reactionTotal} votes`
// 	);
// 	return openThreadData[0];
// }

// const handleVetoPending = require("../../utility/discord/submissionsVeto/handleVetoPending"); // Require down here to avoid circular dependency issues with pendingThreads
// const addReactions = require("../../utility/discord/reactions/addReactions");
// async function evaluateVetoThreadData(threadData, vetoForum, statusTagMap, idTagMap, pendingTagId) {
// 	await evaluateThreadData(threadData, vetoForum, statusTagMap, idTagMap, VETO_SYNC_CODE);

// 	if(threadData.status === "PENDING APPROVAL" && !pendingThreads.has(threadData.thread.id)) {
// 		if(threadData.threadDoc.expirationTime) {
// 			const expirationDate = new Date(threadData.threadDoc.expirationTime);
// 			threadData.starterMessage.edit(`‼️ **Last Chance!** Pending Status expires ${time(expirationDate, TimestampStyles.RelativeTime)}...\n\n${threadData.videoLink}`);
// 			setTimeout(
// 				() => handleVetoJudgement(threadData.thread.client, threadData.thread.id), 
// 				threadData.threadDoc.expirationTime - Date.now()
// 			);
// 			pendingThreads.add(threadData.thread.id);
// 		} else { // TODO maybe evaluationpromises
// 			await handleVetoPending(threadData.thread, pendingTagId, threadData.starterMessage, threadData.videoLink); // Specify video link in case the content has extras
// 		}
// 	}
// }

// async function evaluateThreadData(threadData, forum, statusTagMap, idTagMap, syncCode) { // Guaranteed to have a video link by this point so it is not checked
// 	const evaluationPromises = [];
	
// 	let threadRecreated = false; // Used when checking whether the bot itself has reacted to the thread
// 	if(!threadData.starterMessage) {
// 		threadRecreated = true;
// 		evaluationPromises.push(new Promise(async resolve => {
// 			const oldThreadId = threadData.thread.id;

// 			const [newThreads] = await Promise.all([
// 				createReactedThreadsFromVideos([threadData.videoLink], forum),
// 				threadData.thread.delete(generateSyncMessage(syncCode, `Created new Thread for Thread ${oldThreadId}`, `Thread ${oldThreadId} was missing starter message`))
// 			]);
// 			threadData.thread = newThreads[0];
	
// 			logSyncMessage(syncCode, `Created new Thread for Thread ${threadData.thread.id}`, `Thread ${oldThreadId} was missing starter message`);
// 			threadData.threadDoc.threadId = threadData.thread.id;
// 			resolve();
// 		}));
// }
	
// 	if(threadData.thread.name === "New Submission!") evaluationPromises.push(new Promise(async resolve => {
// 		const title = await getVideoTitle(threadData.videoLink);
// 		if(title) {
// 			await threadData.thread.setName(title);
// 			logSyncMessage(syncCode, `Updated Thread Name TO ${title} for Thread ${threadData.thread.id}`, `Name was "New Submission!" and a title was found`);
// 			threadData.threadDoc.videoTitle = title;
// 		}
// 		resolve();
// 	}));
	
// 	const appliedTag = idTagMap.get(threadData.thread.appliedTags[0]);
// 	if(appliedTag.name.toUpperCase() !== threadData.status) {
// 		const statusTag = statusTagMap.get(threadData.status);
// 		evaluationPromises.push(new Promise(async resolve => {
// 			await threadData.thread.setAppliedTags([statusTag.id]);
// 			logSyncMessage(syncCode, `Set Tag to ${statusTag.name} for Thread ${threadData.thread.id}`, "Old Tag didn't match status");
// 			resolve();
// 		}));
// 	}

// 	if(!threadRecreated) { // A recreated thread will have the bot's reactions
// 		for(const emojiCode of JUDGEMENT_EMOJI_CODES) {
// 			const reaction = threadData.starterMessage.reactions.resolve(emojiCode);
// 			try { if(reaction.me) continue; } // If reaction does not exist this will throw
// 			catch(ignored) {}
			
// 			logSyncMessage(syncCode, `Added Reaction ${emojiCode} to Thread ${threadData.thread.id}`, "Thread was missing the Reaction");
// 			evaluationPromises.push(threadData.starterMessage.react(emojiCode));
// 		}	
// 	}
	

// 	threadData.threadDoc.videoLink = threadData.videoLink;
// 	threadData.threadDoc.status = threadData.status;
// 	if(threadData.thread.name !== "New Submission!") threadData.threadDoc.videoTitle = threadData.thread.name;

// 	await Promise.all(evaluationPromises);
// 	await Submission.enqueue(() => threadData.threadDoc.save());

// 	logSyncMessage(syncCode, `Finished evaluating Finalist ${threadData.thread.id}`);
// 	return threadData;
// }

// async function findUnprocessedDocs(checkedVideoIds) {
// 	const regices = new Array(checkedVideoIds.size);
// 	let counter = 0;
// 	for(const linkId of checkedVideoIds.keys()) { // An unprocessed doc will be one which does not have a thread; those that will therefore have a meaningful effect on the system state will be those with unchecked video links
// 		const literalId = linkId.replaceAll(/[\\\?\.]/g, "\\$1");
// 		regices[counter] = new RegExp(literalId);
// 		counter++;
// 	}

// 	return await Submission.enqueue(() => Submission.find({
// 		videoLink: {$nin: regices}
// 	}).exec());
// }

// function generateIdTagMap(tags, emojiCodes) {
// 	return new Map(
// 		tags.filter(tag => emojiCodes.has(tag.emoji.name))
// 			.map(tag => [tag.id, tag])
// 	);
// }

// function generateStatusTagMap(tags, statuses) {
// 	return new Map(
// 		tags.filter(tag => statuses.includes(tag.name.toUpperCase()))
// 			.map(tag => [tag.name.toUpperCase(), tag])
// 	);
// }



// function logCompetitorSyncMessage(syncCode, keyThreadId, threadData, typeDescriptor) {
// 	const ids = threadData.map(threadData => threadData.thread.id);
// 	const listedIds = TextFormatter.listItems(ids);
// 	logSyncMessage(syncCode, `Found ${threadData.length} [${listedIds}] ${typeDescriptor} Competitor Threads for Thread ${keyThreadId} (including self)`);
// }



// async function handleVetoSync3(vetoForum, submissionsForum) {
// 	const idTagMap = generateIdTagMap(vetoForum.availableTags);
// 	const waitingTag = vetoForum.availableTags.find(tag => tag.emoji.name === OPEN_EMOJI_CODES[0]);
// 	const pendingTagId = vetoForum.availableTags.find(tag => tag.emoji.name === OPEN_EMOJI_CODES[1]).id;

// 	const threadBulk = await getAllThreads(vetoForum);
// 	await Promise.all(threadBulk.mapValues(bulkThread => new Promise(async resolve => {
// 		let {fetchedThread, threadDoc, starterMessage, videoLink} = await getThreadDocMessageAndVideoLink(vetoForum, bulkThread.id);
// 		if(!fetchedThread) {
// 			logSyncMessage(VETO_SALVAGE_CODE, `THREAD ${bulkThread.id} NO LONGER EXISTS`);
// 			// continue;
// 		};
		
// 		if(!threadDoc || !videoLink) {
// 			logSyncMessage(VETO_SALVAGE_CODE, `ATTEMPTING SALVAGE on ${fetchedThread.id}`);
			
// 			({threadDoc, videoLink} = await salvageThreadData2(fetchedThread, threadDoc, videoLink));
// 			if(!threadDoc || !videoLink) {
// 				logSyncMessage(VETO_SALVAGE_CODE, `FAILED SALVAGE on ${fetchedThread.id}`);

// 				await Promise.all([
// 					thread.delete(),
// 					Submission.enqueue(Submission.deleteOne({_id: (threadDoc ?? {})._id}).exec())
// 				]);
// 				//continue;
// 			}
// 			logSyncMessage(VETO_SALVAGE_CODE, `SUCCEEDED SALVAGE on ${fetchedThread.id}`);
// 		}
// 	})));
// }
// // 	const threadStatus = CLOSED_VETO_STATUSES.has()
// // const youtubeMatch = videoLink.match(youtubeIdRegex);
// // const competitorDocs = await Submission.enqueue(() => Submission.find({
// // 	threadId: {$ne: fetchedThread.id}, 
// // 	videoLink: {$regex: youtubeMatch[1]}
// // }).exec());
// // await Promise.all(competitorDocs.map(competitorDoc => new Promise(async resolve => {
// // 	const forum = VETO_STATUSES.has(competitorDoc.status) ? process.env.VETO_FORUM_ID : process.env.SUBMISSIONS_FORUM_ID;
// // 	let thread;
// // 	try {
// // 		thread = await forum.threads.fetch(competitorDoc.threadId);
// // 	} catch(error) {
// // 		resolve("placeholder!!!");
// // 	}

// // 	const tag = idTagMap.get(thread.appliedTags[0]);
// // 	if(CLOSED_VETO_STATUSES.has(tag.name.toUpperCase())) {

// // 	}	


// // })));

// async function salvageThreadData2(thread, threadDoc, videoLink) {
// 	if(!threadDoc && !videoLink) {
// 		return {};
// 	}
	
// 	if(!videoLink) { // threadDoc && !videoLink
// 		if(!threadDoc.videoLink.match(youtubeIdRegex)) return {threadDoc: threadDoc};
// 		return {threadDoc: threadDoc, videoLink: videoLink};
// 	}

// 	if(!threadDoc) { // !threadDoc && videoLink
// 		const youtubeMatch = videoLink.match(youtubeIdRegex);
// 		const alternateDoc = await Submission.enqueue(() => Submission.findOne({videoLink: {$regex: youtubeMatch[1]}}).exec());
// 		if(!alternateDoc) return {};

// 		await Submission.enqueue(() => Submission.create({threadId: thread.id, videoLink: videoLink, status: "???"})); // Status corrected later on
// 		return {threadDoc: alternateDoc, videoLink: videoLink};
// 	}

// 	return {threadDoc: threadDoc, videoLink: videoLink};
// }




















// const VETO_EMOJI_CODES = [...JUDGEMENT_EMOJI_CODES, ...OPEN_EMOJI_CODES];
// async function handleVetoSync2(vetoForum, submissionsForum) {
// 	const idTagMap = generateIdTagMap(vetoForum.availableTags);
// 	const waitingTag = vetoForum.availableTags.find(tag => tag.emoji.name === OPEN_EMOJI_CODES[0]);
// 	const pendingTagId = vetoForum.availableTags.find(tag => tag.emoji.name === OPEN_EMOJI_CODES[1]).id;

// 	const threadBulk = await getAllThreads(vetoForum);
// 	for(const bulkThread of threadBulk.values()) {
// 		let {fetchedThread, threadDoc, starterMessage, videoLink} = await getThreadDocMessageAndVideoLink(vetoForum, bulkThread.id);
// 		if(!fetchedThread) continue;
		
// 		if(!threadDoc || !starterMessage || !videoLink) {
// 			logSyncMessage(VETO_SALVAGE_CODE, `ATTEMPTING SALVAGE on ${fetchedThread.id}`);
// 			const logId = fetchedThread.id; // fetchedThread may be lost during salvage
// 			({thread: fetchedThread, threadDoc, starterMessage} = await salvageThreadData(
// 				fetchedThread, threadDoc, 
// 				starterMessage, videoLink,
// 				undefined, 
// 				submissionsForum, vetoForum,
// 				idTagMap,
// 				VETO_SALVAGE_CODE
// 			)); // In case some data cannot be found or does not exist (set approved tag map as undefined as veto will not go down that path)
// 			if(!fetchedThread || !threadDoc || !starterMessage) {
// 				logSyncMessage(VETO_SALVAGE_CODE, `COULD NOT SALVAGE thread ${logId}`);
// 				continue;
// 			}
// 			logSyncMessage(VETO_SALVAGE_CODE, `SALVAGED thread ${fetchedThread.id}`);
// 		}
		
// 		let appliedTag = idTagMap.get(fetchedThread.appliedTags[0]);
		
// 		if(!VETO_EMOJI_CODES.includes(appliedTag.emoji)) {
// 			await fetchedThread.setAppliedTags([waitingTag.id]);
// 			appliedTag = waitingTag;
// 		}
	
// 		if(appliedTag.name === "Awaiting Veto") await handleAwaitingVetoThread(fetchedThread, starterMessage, pendingTagId);
// 		else if(appliedTag.name === "Pending Approval") handlePendingApprovalThread(fetchedThread, threadDoc, starterMessage, pendingTagId);
// 		await matchThreadDocStatus(threadDoc, appliedTag.name);
// 	}
// }

// const SUBMISSION_EMOJI_CODES = [...JUDGEMENT_EMOJI_CODES, OPEN_EMOJI_CODES[0]];
// async function handleSubmissionSync2(submissionsForum, vetoForum) {
// 	const idTagMap = generateIdTagMap(submissionsForum.availableTags);
// 	const approvedTagId = submissionsForum.availableTags.find(tag => tag.emoji.name === JUDGEMENT_EMOJI_CODES[0]).id;

// 	const threadBulk = await getAllThreads(submissionsForum);
// 	for(const bulkThread of threadBulk.values()) {
// 		let {fetchedThread, threadDoc, starterMessage, videoLink} = await getThreadDocMessageAndVideoLink(submissionsForum, bulkThread.id);
// 		if(!fetchedThread) continue;

// 		if(!threadDoc || !starterMessage || !videoLink) {
// 			logSyncMessage(SUBMISSIONS_SALVAGE_CODE, `ATTEMPTING SALVAGE on ${logId}`);
// 			const logId = fetchedThread.id; // fetchedThread may be lost during salvage
// 			({thread: fetchedThread, threadDoc, starterMessage} = await salvageThreadData( // In case some data cannot be found or does not exist
// 				fetchedThread, threadDoc, 
// 				starterMessage, videoLink,
// 				approvedTagId, 
// 				submissionsForum, vetoForum, 
// 				idTagMap,
// 				SUBMISSIONS_SALVAGE_CODE
// 			));

// 			if(!fetchedThread || !threadDoc || !starterMessage) {
// 				logSyncMessage(SUBMISSIONS_SALVAGE_CODE, `COULD NOT SALVAGE thread ${logId}`);
// 				continue;
// 			}
// 			logSyncMessage(SUBMISSIONS_SALVAGE_CODE, `SALVAGED thread ${fetchedThread.id}`);
// 		}
		
// 		let appliedTag = idTagMap.get(fetchedThread.appliedTags[0]);

// 		if(!SUBMISSION_EMOJI_CODES.includes(appliedTag.emoji)) {
// 			await fetchedThread.setAppliedTags([waitingTag.id]);
// 			appliedTag = waitingTag;
// 		}

// 		if(appliedTag.name === "Awaiting Decision") await handleAwaitingDecisionThread(fetchedThread, starterMessage, pendingTagId);
// 		await matchThreadDocStatus(threadDoc, appliedTag.name);
// 	}
// }








// async function salvageThreadData(thread, threadDoc, starterMessage, videoLink, approvedTagId, submissionsForum, vetoForum, idTagMap, salvageCode = "Sa") {
// 	if(!threadDoc && !starterMessage) {
// 		await thread.delete("FORUM SYNC: Could not salvage.");
// 		logSyncMessage(salvageCode, `DELETED thread ${thread.id}`, "Missing both thread doc and starter message");
// 		return {};
// 	}
// 	if(!videoLink) {
// 		if(!threadDoc) return await salvageMessagelessNoVideoLink(thread, threadDoc, salvageCode); // Unique edge case which otherwise breaks the below function due to absence of threadDoc
// 		return await salvageFromNoStarterMessage( // Checks threadDoc for salvage steps, which causes an error if threadDoc is absent
// 			thread, threadDoc,
// 			submissionsForum, vetoForum,
// 			salvageCode
// 		);
// 	}
// 	if(threadDoc && !starterMessage) { // Having no video link is equivalent to having no starter message
// 		return await salvageFromNoStarterMessage(
// 			thread, threadDoc, 
// 			submissionsForum, vetoForum, 
// 			salvageCode
// 		);
// 	}
// 	if(!threadDoc && starterMessage) {
// 		return await salvageFromNoThreadDoc(
// 			thread, 
// 			starterMessage, videoLink,
// 			approvedTagId, 
// 			submissionsForum, vetoForum, 
// 			idTagMap, 
// 			salvageCode
// 		);
// 	}
// 	return {fetchedThread: thread, threadDoc: threadDoc, starterMessage: starterMessage}; // No salvaging required
// }

// async function salvageFromNoStarterMessage(thread, threadDoc, submissionsForum, vetoForum, salvageCode) {
// 	if(!threadDoc.videoLink) return await salvageMessagelessNoVideoLink(thread, threadDoc, salvageCode);

// 	const youtubeMatch = threadDoc.videoLink.match(youtubeIdRegex);
// 	if(!youtubeMatch) return await salvageMessagelessNoVideoLink(thread, threadDoc, salvageCode);

// 	otherThreadDoc = await Submission.enqueue(() => Submission.findOne({threadId: {$ne: thread.id}, videoLink: {$regex: new RegExp(youtubeMatch[1])}}).exec());
// 	if(!otherThreadDoc) return await salvageMessagelessNoOtherDoc(thread, threadDoc, salvageCode);

// 	const otherThreadForum = VETO_STATUSES.includes(otherThreadDoc.status) ? vetoForum : submissionsForum;
// 	try { 
// 		const otherThread = await otherThreadForum.threads.fetch(otherThreadDoc.threadId);
// 		const otherStarterMessage = await otherThread.fetchStarterMessage();
// 		if(getVideosFromMessage(otherStarterMessage, false).length === 0) throw new Error("No video.");
// 	} catch(error) { // otherThread does not exist
// 		return await salvageMessagelessCompetitorVoid(thread, threadDoc, otherThreadDoc, salvageCode);
// 	}
// 	return await salvageMessagelessCompetitorReal(thread, threadDoc, salvageCode);
// }

// async function salvageFromNoThreadDoc(thread, starterMessage, videoLink, approvedTagId, submissionsForum, vetoForum, idTagMap, salvageCode) {
// 	const youtubeMatch = videoLink.match(youtubeIdRegex); // {link, id, index, input, groups}
// 	let otherThreadDoc = await Submission.enqueue(() => Submission.findOne({threadId: {$ne: thread.id}, videoLink: {$regex: new RegExp(youtubeMatch[1])}}).exec());
// 	if(!otherThreadDoc) return await salvageDoclessNoCompetitor(thread, starterMessage, videoLink, salvageCode);
	
// 	const otherThreadForum = VETO_STATUSES.includes(otherThreadDoc.status) ? vetoForum : submissionsForum;
// 	let otherThread, otherStarterMessage;
// 	try { 
// 		otherThread = await otherThreadForum.threads.fetch(otherThreadDoc.threadId);
// 		otherStarterMessage = await otherThread.fetchStarterMessage({force: true});
// 		if(getVideosFromMessage(otherStarterMessage, false).length === 0) throw new Error("No video.");
// 	} catch(error) { // otherThread does not exist
// 		return await salvageDoclessCompetitorVoid(thread, starterMessage, otherThreadDoc, salvageCode);
// 	}
// 	if(otherThreadForum.id === process.env.VETO_FORUM_ID) {
// 		if(thread.parent.id === process.env.VETO_FORUM_ID) return await salvageVetoAtVetoCompetitor(thread, starterMessage, otherThreadDoc, otherStarterMessage, salvageCode);
// 		else return await salvageSubmissionAtVetoCompetitor(thread, approvedTagId, salvageCode);
// 	} else {
// 		if(thread.parent.id === process.env.VETO_FORUM_ID) return await salvageVetoAtSubmissionCompetitor(thread, starterMessage, otherThreadDoc, salvageCode);
// 		else return await salvageSubmissionAtSubmissionCompetitor(thread, starterMessage, otherThread, otherThreadDoc, idTagMap, salvageCode);
// 	}
// }

// async function salvageDoclessNoCompetitor(thread, starterMessage, videoLink, salvageCode) {
// 	const newThreadDoc = await Submission.create({threadId: thread.id, videoLink: videoLink, status: "TEMP"}); // Status assigned later
// 	logSyncMessage(salvageCode, `CREATED NEW DOC for thread ${thread.id}`, "No alternative doc was found");
// 	return {thread: thread, threadDoc: newThreadDoc, starterMessage: starterMessage};
// }

// async function salvageDoclessCompetitorVoid(thread, starterMessage, otherThreadDoc, salvageCode) {
// 	otherThreadDoc = await redirectSaveSubmissionDoc(otherThreadDoc, thread.id);
// 	logSyncMessage(salvageCode, `REDIRECTED OTHER DOC to thread ${thread.id}`, "Alternative doc did not point to a real thread");
// 	return {thread: thread, threadDoc: otherThreadDoc, starterMessage: starterMessage};
// }

// async function salvageMessagelessNoVideoLink(thread, threadDoc, salvageCode) {
// 	await Promise.all([
// 		thread.delete("FORUM SYNC: Deleted as video link could not be found."),
// 		Submission.enqueue(() => Submission.deleteOne({_id: threadDoc._id}).exec())
// 	]);
// 	logSyncMessage(salvageCode, `DELETED thread and doc ${thread.id}`, "Thread and threadDoc missing video link");
// 	return {};
// }

// async function salvageMessagelessNoOtherDoc(thread, threadDoc, salvageCode) {
// 	const newThread = (await createReactedThreadsFromVideos([threadDoc.videoLink], thread.parent))[0];
// 	const docAndStarterMessage = await Promise.all([
// 		redirectSaveSubmissionDoc(threadDoc, newThread.id),
// 		newThread.fetchStarterMessage({force: true}),
// 		thread.delete("FORUM SYNC: Created new thread as starter message was missing and no replacement could be found."),
// 	]);

// 	logSyncMessage(salvageCode, `DELETED THREAD ${thread.id}, CREATED thread ${newThread.id} and REDIRECTED DOC to thread ${newThread.id}`, "No conflicting thread was found but starter message needed to be supplied");
// 	return {thread: newThread, threadDoc: docAndStarterMessage[0], starterMessage: docAndStarterMessage[1]};
// }

// async function salvageMessagelessCompetitorReal(thread, threadDoc, salvageCode) {
// 	await Promise.all([
// 		thread.delete("FORUM SYNC: Deleted as matching thread was found."),
// 		Submission.enqueue(() => Submission.deleteOne({_id: threadDoc._id}).exec())
// 	]) 
// 	logSyncMessage(salvageCode, `DELETED THREAD ${thread.id}`, "Competitor thread was found with video link while target thread was lacked one");
// 	return {};
// }

// async function salvageMessagelessCompetitorVoid(thread, threadDoc, otherThreadDoc, salvageCode) {
// 	const newThread = (await createReactedThreadsFromVideos([threadDoc.videoLink], thread.parent))[0];
// 	const docAndStarterMessage = await Promise.all([
// 		redirectSaveSubmissionDoc(threadDoc, newThread.id),
// 		newThread.fetchStarterMessage({force: true}),
// 		thread.delete("FORUM SYNC: Created new thread as starter message was missing, but DB doc was found."),
// 		Submission.enqueue(() => Submission.deleteOne({_id: otherThreadDoc._id}).exec())
// 	]);
	
// 	logSyncMessage(salvageCode, `DELETED THREAD ${thread.id}, CREATED thread ${newThread.id} and REDIRECTED DOC to thread ${newThread.id}`, "Conflicting thread did not exist/was missing data but starter message needed to be supplied");
// 	return {thread: newThread, threadDoc: docAndStarterMessage[0], starterMessage: docAndStarterMessage[1]};
// }

// async function salvageVetoAtVetoCompetitor(thread, starterMessage, otherThreadDoc, otherStarterMessage, salvageCode) {	
// 	const reactionCount = sumReactions(starterMessage, JUDGEMENT_EMOJI_CODES);
// 	const otherReactionCount = sumReactions(otherStarterMessage, JUDGEMENT_EMOJI_CODES);
// 	console.log(reactionCount);
// 	console.log(otherReactionCount);
// 	if(reactionCount > otherReactionCount) {
// 		otherThreadDoc = await redirectSaveSubmissionDoc(otherThreadDoc, thread.id);
// 		logSyncMessage(salvageCode, `REDIRECTED OTHER DOC to thread ${thread.id}`, "Competitor veto thread had less reactions");
// 		return {thread: thread, threadDoc: otherThreadDoc, starterMessage: starterMessage};
// 	}
	
// 	await thread.delete("FORUM SYNC: Deleted as competitor veto thread had more or equal votes.");
// 	logSyncMessage(salvageCode, `DELETED thread ${thread.id}`, "Competitor veto thread had more reactions");
// 	return {};
// }

// async function salvageSubmissionAtVetoCompetitor(thread, approvedTagId, salvageCode) {
// 	await thread.setAppliedTags([approvedTagId]);
// 	logSyncMessage(salvageCode, `SET TAG APPROVED for thread ${thread.id}`, "Matching doc points to veto forum");
// 	return {};
// }

// async function salvageVetoAtSubmissionCompetitor(thread, starterMessage, otherThreadDoc, salvageCode) {
// 	otherThreadDoc = await redirectSaveSubmissionDoc(otherThreadDoc, thread.id);
// 	logSyncMessage(salvageCode, `REDIRECTED OTHER DOC to thread ${thread.id}`, "Matching doc points to submissions forum");
// 	return {thread: thread, threadDoc: otherThreadDoc, starterMessage: starterMessage};
// }

// async function salvageSubmissionAtSubmissionCompetitor(thread, starterMessage, otherThread, otherThreadDoc, idTagMap, salvageCode) {
// 	const threadEmojiCode = idTagMap.get(thread.appliedTags[0]).emoji.name;
// 	const otherThreadEmojiCode = idTagMap.get(otherThread.appliedTags[0]).emoji.name;
// 	if(threadEmojiCode === otherThreadEmojiCode) {
// 		await thread.delete("FORUM SYNC: Deleted as matching thread was found during forum sync.");
// 		logSyncMessage(salvageCode, `DELETED thread ${thread.id}`, "Matching thread shares tag");
// 		return {};
// 	}

// 	const threadClosed = JUDGEMENT_EMOJI_CODES.includes(threadEmojiCode);
// 	const otherThreadClosed = JUDGEMENT_EMOJI_CODES.includes(otherThreadEmojiCode);
// 	if(!threadClosed && otherThreadClosed) {
// 		await thread.delete("FORUM SYNC: Deleted as matching thread was found during forum sync.");
// 		logSyncMessage(salvageCode, `DELETED thread ${thread.id}`, "Matching thread holds closed tag while thread is open");
// 		return {};
// 	}
// 	otherThreadDoc = await redirectSaveSubmissionDoc(otherThreadDoc, thread.id); // Other doc will delete as it no longer has a doc
// 	logSyncMessage(salvageCode, `REDIRECTED OTHER DOC to thread ${thread.id}`, "Matching thread holds open tag while thread is closed");
// 	return {thread: thread, threadDoc: otherThreadDoc, starterMessage: starterMessage}; 
// }

// async function redirectSaveSubmissionDoc(submissionDoc, targetThreadId) {
// 	submissionDoc.threadId = targetThreadId;
// 	submissionDoc.status = "TEMP";
// 	return submissionDoc.save();
// }

// function generateSyncMessage(code, action, reason) {
// 	return `[${code}] | ${action}.` + (reason ? ` Reason: ${reason}.` : "");
// }

// function logSyncMessage(code, action, reason) {
// 	console.log(generateSyncMessage(code, action, reason));
// }

// function generateIdTagMap(tags) {
// 	return new Map(
// 		tags.filter(tag => VETO_EMOJI_CODES.includes(tag.emoji.name))
// 			.map(tag => [tag.id, tag])
// 	);
// }

// function generateStatusTagMap(tags) {
// 	return new Map(
// 		tags.filter(tag => VETO_STATUSES.has(tag.name.toUpperCase()))
// 			.map(tag => [tag.name.toUpperCase(), tag])
// 	);
// }

// async function getThreadDocMessageAndVideoLink(forum, threadId) {
// 	const threadDocPromise = Submission.enqueue(() => Submission.findOne({threadId: threadId}).exec());

// 	let fetchedThread = await forum.threads.fetch(threadId, {force: true});
// 	if(!fetchedThread) return {};

// 	let starterMessage;
// 	try { starterMessage = await fetchedThread.fetchStarterMessage({force: true});
// 	} catch(ignored) {}
// 	const videoLink = getVideosFromMessage(starterMessage, false)[0];

// 	const threadDoc = await threadDocPromise;
// 	return {fetchedThread: fetchedThread, threadDoc: threadDoc, starterMessage: starterMessage, videoLink: videoLink}
// }

// async function handleAwaitingVetoThread(fetchedThread, starterMessage, pendingTagId) {
// 	const count = JUDGEMENT_EMOJI_CODES.reduce(
// 		(total, emojiCode) => total + starterMessage.reactions.resolve(emojiCode)?.count ?? 0, 
// 		0
// 	);
// 	if(count >= parseInt(process.env.VETO_THRESHOLD + 2)) {
// 		return handleVetoPending(fetchedThread, pendingTagId, starterMessage);
// 	}
// }

// function handlePendingApprovalThread(fetchedThread, threadDoc, starterMessage, pendingTagId) {
// 	if(this.pendingThreadDocs.has(fetchedThread.id)) return; // Already set up
// 	if(!threadDoc.expirationTime) return handleVetoPending(fetchedThread, pendingTagId, starterMessage);

// 	const timeout = threadDoc.expirationTime - Date.now().valueOf(); // Amount of time left
// 	setTimeout(() => handleVetoJudgement(client, fetchedThread.id), timeout);
// 	this.pendingThreadDocs.set(fetchedThread.id, threadDoc);
// 	return;
// }

// async function handleAwaitingDecisionThread(fetchedThread, starterMessage) {
// 	const counts = JUDGEMENT_EMOJI_CODES.map(emojiCode => starterMessage.reactions.resolve(emojiCode)?.count ?? 0);
// 	if(counts[0] > counts[1]) return handleSubmissionApprove(fetchedThread, starterMessage);
// 	else if (counts[0] < counts[1]) return handleSubmissionReject(fetchedThread);
// }

// async function matchThreadDocStatus(threadDoc, appliedTagName) {
// 	const threadStatus = appliedTagName.toUpperCase();
// 	if(threadDoc.status === threadStatus) return;
				
// 	threadDoc.status = threadStatus;
// 	return threadDoc.save();
// }