const linkRegex = require("../../linkRegex");

module.exports = (message, includeAttachments = true) => {
	const videoLinks = [];

	if(includeAttachments) {
		message?.attachments
			?.filter(attachment => attachment.contentType.includes("video"))
			.forEach(attachment => videoLinks.push(attachment.url));
	}

	message?.cleanContent
		.match(linkRegex) // Match all includes capturing groups which we don't care about at the moment
		?.forEach(match => videoLinks.push(match));

	return videoLinks;
}