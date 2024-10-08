const { Submission } = require("../mongo/mongoModels").modelData;

const youtubeIdRegex = require("./youtubeIdRegex");

module.exports = async (videoLink) => {
	if(await Submission.enqueue(() => Submission.exists({videoLink: videoLink}).exec())) return true;
	
	const youtubeMatch = videoLink.match(youtubeIdRegex);
	if(youtubeMatch) { // Check for matching youtube id
		if(await Submission.enqueue(() => Submission.exists({videoLink: {$regex: new RegExp(youtubeMatch[1])}}).exec())) {
			return true;
		}
	}
	
	return false;
}