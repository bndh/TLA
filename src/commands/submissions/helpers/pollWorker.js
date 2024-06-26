require("dotenv").config();
const {workerData, parentPort} = require("worker_threads");
const getVideosFromMessage = require("../../../utility/discord/getVideosFromMessage");

(() => {
	const videoLinks = getVideosFromMessage(workerData);
	parentPort.postMessage(videoLinks);
})();