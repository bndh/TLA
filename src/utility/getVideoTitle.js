const youtubeIdRegex = require("./youtubeIdRegex");

module.exports = async (videoLink) => {
	const youtubeMatch = videoLink.match(youtubeIdRegex);
	if(!youtubeMatch) return;

	const youtubeId = youtubeMatch[1];

	const identificationResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?key=${process.env.YOUTUBE_API_KEY}&part=snippet&id=${youtubeId}`);
	if(!identificationResponse.ok) {
		console.warn("Youtube API response NOT OK");
		return;
	}

	const identificationJson = await identificationResponse.json();
	if(identificationJson.pageInfo.totalResults === 0) return;

	return identificationJson.items[0].snippet.title;
}