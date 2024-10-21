require("dotenv").config();

const {Events, EmbedBuilder} = require("discord.js");

const { Judge } = require("../mongo/mongoModels").modelData;

const getTagByEmojiCode = require("../utility/discord/threads/getTagByEmojiCode");
const handleSubmissionReject = require("../utility/discord/submissionsVeto/handleSubmissionReject");
const handleSubmissionApprove = require("../utility/discord/submissionsVeto/handleSubmissionApprove");
const handleVetoPending = require("../utility/discord/submissionsVeto/handleVetoPending");

const JUDGEMENT_EMOJI_CODES = process.env.JUDGEMENT_EMOJI_CODES.split(", ");
const OPEN_EMOJI_CODES = process.env.OPEN_EMOJI_CODES.split(", ");

const VETO_THRESHOLD = parseInt(process.env.VETO_THRESHOLD);

module.exports = {
	name: Events.MessageReactionAdd,
	async execute(messageReaction, user) { // TODO: Some kind of caching issue here
		if(messageReaction.partial) messageReaction = await messageReaction.fetch();
		handleIntactReaction(messageReaction, user);
	}
};

async function handleIntactReaction(messageReaction, user) {
	if(user.id === process.env.CLIENT_ID) return;
	const forum = messageReaction.message.channel.parent;
	if(!forum) return; // Indicates that it's not a thread

	const submissionThread = messageReaction.message.channel;

	console.info(`Judgement Reaction by User ${user.id} in Thread ${submissionThread.id}`)

	if(forum.id === process.env.SUBMISSIONS_FORUM_ID) handleSubmissionResponse(messageReaction, submissionThread, user);
	else if(forum.id === process.env.VETO_FORUM_ID) handleVetoResponse(messageReaction, submissionThread, user);
}

async function handleSubmissionResponse(messageReaction, submissionThread, judge) {
	const judgeDoc = await Judge.enqueue(() => Judge.findOne({userId: judge.id}).exec());
	if(!judgeDoc?.counselledSubmissionIds.includes(submissionThread.id)) { // Don't add something that's already there
		Judge.enqueue(() => Judge.updateOne({userId: judge.id}, {$push: {counselledSubmissionIds: submissionThread.id}}));
	}
	if(messageReaction.emoji.name === JUDGEMENT_EMOJI_CODES[0]) await handleSubmissionApprove(submissionThread, messageReaction.message);
	else if(messageReaction.emoji.name === JUDGEMENT_EMOJI_CODES[1]) handleSubmissionReject(submissionThread);
}

async function handleVetoResponse(messageReaction, submissionThread, judge) {
	if(!JUDGEMENT_EMOJI_CODES.includes(messageReaction.emoji.name)) return;
	const forum = submissionThread.parent;
	
	const closedTagIds = JUDGEMENT_EMOJI_CODES.map(emojiCode => getTagByEmojiCode(forum, emojiCode).id);
	if(submissionThread.appliedTags.some(appliedTagId => closedTagIds.includes(appliedTagId))) { 
		messageReaction.users.remove(judge.id); // Prevents people from cheating with closedSubmissions on sync
		try { await judge.send({embeds: [EmbedBuilder.generateFailEmbed("Please do **not react** to **closed** submissions!")]});
		} catch(ignored) {} // Error thrown if attempt to DM a user with DMs off
		return;
	} 
	
	const judgeDoc = await Judge.enqueue(() => Judge.findOne({userId: judge.id}).exec());
	if(!judgeDoc.counselledSubmissionIds.includes(submissionThread.id)) { // Don't add something that's already there
		Judge.enqueue(() => Judge.updateOne({userId: judge.id}, {$push: {counselledSubmissionIds: submissionThread.id}}).exec());
	}

	const pendingTagId = getTagByEmojiCode(forum, OPEN_EMOJI_CODES[1]).id; 
	if(submissionThread.appliedTags.some(appliedTagId => appliedTagId === pendingTagId)) return; // Indicates that the thread is pending, which this reaction should not affect for they close after a set amount of time

	if(meetsReactionThreshold(messageReaction, messageReaction.message)) {
		handleVetoPending(submissionThread, pendingTagId, messageReaction.message, messageReaction.message.content);
	}
}

function meetsReactionThreshold(messageReaction, message) {
	let count = messageReaction.count;

	if(count >= VETO_THRESHOLD + 2) return true; // + 2 to account for the bot's reactions

	const emojiCodeIndex = JUDGEMENT_EMOJI_CODES.findIndex(element => element === messageReaction.emoji.name);
	const otherEmojiCode = JUDGEMENT_EMOJI_CODES[(emojiCodeIndex + 1) % JUDGEMENT_EMOJI_CODES.length]; // Increment to find the other judgement emoji
	const otherReaction = message.reactions.resolve(otherEmojiCode);
	if(otherReaction) count += otherReaction.count;
	else console.info(`No other reaction in channel ${message.channel.id}`); // TODO investigate
	

	if(count >= +process.env.VETO_THRESHOLD + 2) return true;
	else return false;
}
