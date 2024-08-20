const {time, TimestampStyles} = require("discord.js");

const Submission = require("../../../mongo/Submission");

const handleVetoJudgement = require("./handleVetoJudgement");

module.exports = async (channel, pendingTagId, message) => {
	const expirationTime = new Date().valueOf() + (+process.env.PENDING_DURATION);
	Submission.enqueue(() => Submission.updateOne({threadId: channel.id}, {status: "PENDING APPROVAL", expirationTime: expirationTime}).exec());
	
	channel.setAppliedTags([pendingTagId]);
	
	const expirationDate = new Date(expirationTime); // 1 week in the future
	message.edit(`‼️ **Last Chance!** Pending Status expires ${time(expirationDate, TimestampStyles.RelativeTime)}\n\n${message.content}...`);

	setTimeout(() => handleVetoJudgement(channel.client, channel.id), +process.env.PENDING_DURATION);
}
