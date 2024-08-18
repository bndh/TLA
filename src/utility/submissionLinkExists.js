const youtubeIdRegex = require("./youtubeIdRegex");
const Submission = require("../mongo/Submission");

module.exports = async (videoLink) => {
	if(await Submission.enqueue(() => Submission.exists({videoLink: videoLink}))) return true;

	const youtubeMatch = videoLink.match(youtubeIdRegex);
	if(youtubeMatch) { // Check for matching youtube id
		if(await Submission.enqueue(() => Submission.exists({videoLink: {$regex: new RegExp(youtubeMatch[1])}}))) return true;
	}
	
	return false;
}