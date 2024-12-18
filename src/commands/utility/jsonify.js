require("dotenv").config();

const { AttachmentBuilder, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fsPromises = require('fs/promises')
const path = require('path');

const { Submission } = require("../../mongo/mongoModels").modelData;
const TextFormatter = require("../../utility/TextFormatter");

const JUDGEMENT_EMOJI_CODES = process.env.JUDGEMENT_EMOJI_CODES.split(", ");

const TIME_FORMAT_REGEX = /<t:(\d+)(?::[tTdDfFR])?>/;

const NAME_MAP = new Map([
	["1", "Video Link"],
	["2", "Video Title"],
	["3", "Upvotes"],
	["4", "Downvotes"],
	["5", "Status"],
	["6", "Close Time"],
	["7", "Pending Expiration Time"],
	["8", "Overturned"],
	["9", "Thread ID"]
]);
const EXTRACTOR_MAP = new Map([
	["1", (doc) => doc.videoLink],																	// Video Link
	["2", (doc) => doc.videoTitle ?? "Unknown"],													// Video Title
	["3", (_, starterMessage) => getReactionCount(starterMessage, JUDGEMENT_EMOJI_CODES[0])],		// Upvotes
	["4", (_, starterMessage) => getReactionCount(starterMessage, JUDGEMENT_EMOJI_CODES[1])],		// Downvotes
	["5", (doc => TextFormatter.capitaliseText(doc.status))],										// Status
	["6", (_, starterMessage) => getJudgementTime(starterMessage.cleanContent)],					// Close Time
	["7", (doc) => doc.expirationTime ? formatTime(doc.expirationTime) : "N/A"],					// Pending Expiration Time
	["8", (_, starterMessage) => getOverturned(starterMessage.cleanContent)], 						// Overturned
	["9", (doc) => doc.threadId]																	// Thread ID
]);


module.exports = {
	data: new SlashCommandBuilder()
		.setName("jsonify")
		.setDescription("Provides a json-converted version of the submission database.")
		.addIntegerOption(optionBuilder => optionBuilder // Is an integer for input sanitation; processed as a string
			.setName("export-pattern")
			.setRequired(false)
			.setDescription("Define which fields you want exported. (See /help, default: 2134).")
			.setMinValue(0)
		)
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("approved-only")
			.setDescription("Exports only approved submissions. (Default: true).")
		)
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("visible")
			.setRequired(false)
			.setDescription("Whether to make the response publicly visible or not. (Default: false).")
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const exportPattern = (interaction.options.getInteger("export-pattern", false) ?? 2134).toString();
		const approvedOnly = interaction.options.getBoolean("approved-only", false) ?? true;
		const visible = interaction.options.getBoolean("visible", false) ?? false;
	
		await interaction.deferReply({ephemeral: !visible});

		const filter = approvedOnly ? {status: "APPROVED"} : {};
		const submissionDocs = await Submission.enqueue(() => Submission.find(filter).exec());
		const submissionInfos = await Promise.all(submissionDocs.map(doc => new Promise(async resolve => {
			let starterMessage;
			if(exportPattern.match(/[3468]/)) { // Requires on-thread information
				const thread = await interaction.client.channels.fetch(doc.threadId);
				starterMessage = await thread.fetchStarterMessage({force: true});
			}
			
			let submissionInfo = {};
			for(const elementCode of exportPattern.split("")) {
				const elementName = NAME_MAP.get(elementCode);
				const elementExtractor = EXTRACTOR_MAP.get(elementCode);
				submissionInfo[elementName] = elementExtractor(doc, starterMessage);
			}
			resolve(submissionInfo);
		})));

		const jsonData = JSON.stringify(submissionInfos);
		
		const filepath = path.join(__dirname, 'jsonFiles', `export-${interaction.createdTimestamp}.json`);
		await fsPromises.writeFile(filepath, jsonData);

		const jsonAttachment = new AttachmentBuilder()
			.setFile(filepath)
			.setName(`Submissions@${interaction.createdTimestamp}.json`)
			.setDescription("A json-converted version of the submission database.");
		await interaction.editReply({files: [jsonAttachment]});

		await fsPromises.unlink(filepath); // Delete
		console.log("Done")
	}
}

function getReactionCount(starterMessage, emojiCode) {
	return (starterMessage.reactions.resolve(emojiCode)?.count - 1) ?? 0; // -1 to account for the bot's own reaction
}

function getJudgementTime(text) {
	const timeMatch = text.match(TIME_FORMAT_REGEX);
	if(!timeMatch) return "N/A";

	return formatTime(timeMatch[1] * 1000); // Discord measures in seconds rather than ms so we must *1000
}

function getOverturned(text) {
	const overturned = text.slice(0, "\n").includes("Overriden");
	return booleanToYesNo(overturned);
}

function formatTime(ms) {
	const date = new Date(ms); 
	return date.toLocaleDateString("en-GB", {
		timeZone: "UTC",
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	});
}

function booleanToYesNo(bool) {
	return bool ? "Yes" : "No";
}