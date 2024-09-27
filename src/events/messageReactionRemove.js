const {Events} = require("discord.js");

const { Judge } = require("../mongo/mongoModels").modelData;

const getTagByEmojiCode = require("../utility/discord/threads/getTagByEmojiCode");

const OPEN_EMOJI_CODES = process.env.OPEN_EMOJI_CODES.split(", ");

module.exports = {
	name: Events.MessageReactionRemove,
	async execute(messageReaction, user) {
		if(messageReaction.partial) messageReaction = await messageReaction.fetch();
		handleIntactReaction(messageReaction, user);
	}
};

async function handleIntactReaction(messageReaction, user) {
	const thread = messageReaction.message.channel;
	const forum = thread.parent;
	if(!forum) return;
	if(![process.env.VETO_FORUM_ID, process.env.SUBMISSIONS_FORUM_ID].includes(forum.id)) return;
	
	const openTagIds = OPEN_EMOJI_CODES.map(emojiCode => getTagByEmojiCode(forum, emojiCode).id);
	if(!thread.appliedTags.some(appliedTagId => openTagIds.includes(appliedTagId))) return;
	Judge.enqueue(() => Judge.updateOne({userId: user.id}, {$pull: {counselledSubmissionIds: thread.id}}).exec());
}