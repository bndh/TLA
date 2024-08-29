require("dotenv").config();

const filterUnjudgedThreads = require("./filterUnjudgedThreads");
const getAllThreads = require("./getAllThreads");

module.exports = async (forum) => {
	const threads = await getAllThreads(forum);
	return await filterUnjudgedThreads(forum, threads)
};