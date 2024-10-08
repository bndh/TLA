const getTagByEmojiCode = require("./getTagByEmojiCode");

const JUDGEMENT_EMOJI_CODES = process.env.JUDGEMENT_EMOJI_CODES.split(", ");

module.exports = (threads) => {
	if(threads.size === 0) return;
	
	const forum = threads.at(0).parent;
	const judgedTagIds = JUDGEMENT_EMOJI_CODES.map(code => getTagByEmojiCode(forum, code).id);

	const unjudgedThreads = threads.filter(thread => 
		!judgedTagIds.includes(thread.appliedTags[0]) // The appliedTags property is an array of tag snowflakes (ids)
	);
	return unjudgedThreads;
}