require("dotenv").config();
const { Events } = require("discord.js");
const getTagsFromEmojiCodes = require("../utility/discord/threads/getTagsFromEmojiCodes");

const JUDGEMENT_EMOJI_CODES = process.env.JUDGEMENT_EMOJI_CODES.split(", ");

module.exports = {
	name: Events.ThreadUpdate,
	async execute(oldThread, newThread) {
		if(![process.env.SUBMISSIONS_FORUM_ID, process.env.VETO_FORUM_ID].includes(newThread.parentId) // Only care about threads in the submissions system
		&& !(oldThread.archived === false && newThread.archived === true)) { // Only care about threads which have just become closed
			return; 
		}
		const closedTagIds = getTagsFromEmojiCodes(newThread.parentId, JUDGEMENT_EMOJI_CODES).map(tag => tag.id);
		if(newThread.appliedTags.some(tagId => closedTagIds.includes(tagId))) return; // Only care about open threads
		
		await newThread.setArchived(false, "Thread is not yet closed.");
	}
};