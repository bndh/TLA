require("dotenv").config();

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, time, TimestampStyles, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");

const Info = require("../../mongo/Info");
const Judge = require("../../mongo/Judge");
const Submission = require("../../mongo/Submission");
const Auditee = require("../../mongo/Auditee");
const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const capitalise = require("../../utility/capitalise");
const Coloriser = require("../../utility/Coloriser");
const TextFormatter = require("../../utility/TextFormatter");
const updateOrCreate = require("../../mongo/utility/updateOrCreate");
const { snapshot } = require("./snapshot");

const DIVIDER = Coloriser.color("│", "GREY");
// TODO '' for dupe interim 
// TODO check code considering falsy 0
module.exports = {
	data: new SlashCommandBuilder()
		.setName("audit")
		.setDescription("Manually perform an audit, displaying the contributions that each judge has made")
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("overwrite")
			.setDescription("Whether or not to overwrite the last system state snapshot. (Default: false).")
			.setRequired(false)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply(); // Must await defer for proper error catching externally

		const overwrite = interaction.options.getBoolean("overwrite", false) ?? false;
		let snapshotPromise;
		if(overwrite) {
			snapshotPromise = snapshot(interaction.client);
		} else {
			const previousSnapshotExists = await Info.exists({id: "snapshotCreationTime"});
			if(!previousSnapshotExists) snapshotPromise = snapshot(interaction.client);
		}

		const replyPromise = generateReply(interaction.client);
		
		const completionData = await Promise.all([replyPromise, snapshotPromise]);
		interaction.editReply(completionData[0]);
	},
	generateJudgeTableBlock, // Used externally in page turning mechanisms
	combineAuditDescriptionParts
};

async function generateReply(client) {
	const allAuditees = await prepareAuditees();
	const visibleAuditees = allAuditees.slice(0, parseInt(process.env.AUDITEES_PER_PAGE));
	const sortedAuditees = visibleAuditees.sort((auditeeA, auditeeB) => auditeeB.judgedInInterim - auditeeA.judgedInInterim);

	const auditEmbed = await generateAuditEmbed(client, sortedAuditees, allAuditees.length);
	const actionRow = generateActionRow(allAuditees.length);
	
	return {embeds: [auditEmbed], components: [actionRow]};
}

async function prepareAuditees() {
	const judgeDocs = await Judge.enqueue(() => Judge.find({}).exec());
	const deletionPromise = Auditee.deleteMany({userId: {$nin: judgeDocs.map(doc => doc.userId)}}).exec();

	const auditees = await Promise.all(judgeDocs.map(judgeDoc => createOrUpdateAuditee(judgeDoc)));

	await deletionPromise;
	return auditees;
}

async function generateAuditEmbed(client, sortedAuditees, totalAuditees) {
	return new EmbedBuilder() // Everything except 
		.setAuthor({name: "TLA Admin Team", iconURL: process.env.NORMAL_URL, url: "https://www.youtube.com/@bndh4409"})
		.setTitle("__JUDGE AUDIT REPORT__")
		.setFooter({text: generateFooterText(totalAuditees), iconURL: "https://images.emojiterra.com/twitter/v14.0/512px/1f4c4.png"})
		.setColor(process.env.SUCCESS_COLOR)
		.setDescription(await generateDescriptionText(client, sortedAuditees));
}
// TODO disable old report buttons
function generateActionRow(auditeeCount) {
	const nextPageButton = new ButtonBuilder()
		.setCustomId("next")
		.setDisabled(auditeeCount <= parseInt(process.env.AUDITEES_PER_PAGE)) // Indicates that the first page is the last page
		.setEmoji("➡️")
		.setStyle(ButtonStyle.Secondary);
	const previousPageButton = new ButtonBuilder()
		.setCustomId("previous")
		.setDisabled(true) // Always disabled on page 1
		.setEmoji("⬅️")
		.setStyle(ButtonStyle.Secondary);
	
	const searchButton = new ButtonBuilder()
		.setCustomId("search")
		.setLabel("Search")
		.setEmoji("🔎")
		.setStyle(ButtonStyle.Primary);

	return new ActionRowBuilder()
		.setComponents(previousPageButton, searchButton, nextPageButton);
}

function generateFooterText(totalAuditees, pageNumber = 1) {
	const maxPages = Math.ceil(totalAuditees / parseInt(process.env.AUDITEES_PER_PAGE));
	return `Page ${pageNumber} of ${maxPages}`;
}

async function generateDescriptionText(client, sortedAuditees) {
	const descriptionParts = await Promise.all([
		generateDateText(),
		generateJudgeTableBlock(client, sortedAuditees),
		generateSubmissionTableBlock(),
		generateTotalBlock()
	]);

	return combineAuditDescriptionParts(...descriptionParts);
}

async function generateDateText() {
	const snapshotCreationInfo = await Info.findOne({id: "snapshotCreationTime"}).select({data: 1, _id: 0}).exec();
	const snapshotCreationTime = +snapshotCreationInfo.data;

	const formattedSnapshotTime = time(new Date(snapshotCreationTime), TimestampStyles.LongDate);
	const formattedCurrentTime = time(new Date(Date.now()), TimestampStyles.LongDate);

	return "_" + formattedSnapshotTime + " -> " + formattedCurrentTime + "_";
}

async function generateJudgeTableBlock(client, sortedAuditees, startingIndex = 0, maxPerPage = process.env.AUDITEES_PER_PAGE) { // Defined startingIndex and maxPerPage for external use
	const colouredTopFrame = Coloriser.color(process.env.AUDIT_FRAME_TOP, "GREY");
	const colouredTagFrame = Coloriser.colorFromMarkers(process.env.AUDIT_FRAME_TAG);
	const colouredMidFrame = Coloriser.color(process.env.AUDIT_FRAME_MID, "GREY");
	const colouredContents = await generateFormattedJudgeRows(client, sortedAuditees, startingIndex, maxPerPage);
	const colouredBotFrame = Coloriser.color(process.env.AUDIT_FRAME_BOT, "GREY");

	return "```ansi" + "\n" + // Enables colour highlighting
		   colouredTopFrame + "\n" + 
		   colouredTagFrame + "\n" +
		   colouredMidFrame + "\n" +
		   colouredContents + // \n already attached
		   colouredBotFrame + "```";
}

async function generateFormattedJudgeRows(client, auditees, startingIndex, maxPerPage) {
	const auditeeUserData = await Promise.all(auditees.map(async auditee => client.users.fetch(auditee.userId)));
	const auditeeDisplayNames = auditeeUserData.map(user => user.displayName);

	let rows = "";
	for(let i = 0; i < auditees.length; i++) {
		rows += generateTableRow(startingIndex + i, auditees[i], auditeeDisplayNames[i]) + "\n";
	}
	for(let i = auditees.length; i < parseInt(maxPerPage); i++) {
		rows += Coloriser.color(process.env.AUDIT_FRAME_NIL, "GREY") + "\n";
	}

	return rows;
}

async function generateSubmissionTableBlock() {
	const countRowPromises = Promise.all([
		generateFormattedTagCounts(),
		generateFormattedSubCounts()
	]);

	const colouredTopFrame = Coloriser.color(process.env.SUBMISSION_FRAME_TOP, "GREY");
	const colouredTagFrame = Coloriser.colorFromMarkers(process.env.SUBMISSION_FRAME_TAG);
	const colouredMidFrame = Coloriser.color(process.env.SUBMISSION_FRAME_MID, "GREY");
	const colouredSubFrame = Coloriser.colorFromMarkers(process.env.SUBMISSION_FRAME_SUB);
	const colouredBotFrame = Coloriser.color(process.env.SUBMISSION_FRAME_BOT, "GREY");

	const countRows = await countRowPromises;
	const colouredTagCount = countRows[0];
	const colouredSubCount = countRows[1];

	return "```ansi" + "\n" +
		   colouredTopFrame + "\n" + 
		   colouredTagFrame + "\n" + 
		   colouredTagCount + "\n" + 
		   colouredMidFrame + "\n" + 
		   colouredSubFrame + "\n" + 
		   colouredSubCount + "\n" + 
		   colouredBotFrame + "```";
}

async function generateTotalBlock() {
	const count = await Submission.enqueue(() => Submission.countDocuments().exec());

	let countText = count.toString();
	const properCountLength = countText.length;

	countText = TextFormatter.resizeFront(count.toString(), 5, "0");
	countText = TextFormatter.resizeFront(countText, 38);
	countText = Coloriser.colorFromIndices(
		"Total Submissions:" + countText, 
		[0, 17, 56 - properCountLength], // 56 is the max embed block width, but 55 is used here as indices start at 0
		["WHITE", "GREY", "TEAL"] // White for "Total Submissions:", grey for leading 0's, and teal for the actual count
	);

	return "```ansi" + "\n" + 
		   countText +
		   "```";
}

function combineAuditDescriptionParts(dateText, judgeTableBlock, submissionTableBlock, totalBlock) {
	return dateText + "\n\n" +
		   "**" + judgeTableBlock + "** " +  // Discord puts these on different lines despite the lack of \n; with the \n there is a larger gap
		   "**" + submissionTableBlock + "** " + // Space included after the formatting markdown or it conflicts
		   "**_" + totalBlock + "_**";
}

async function createOrUpdateAuditee(judgeDoc) {
	const totalSubmissionsJudged = calculateTotalSubmissionsJudged(judgeDoc.counselledSubmissionIds, judgeDoc.totalSubmissionsClosed);
	const judgedInInterim = calculateJudgedInInterim(totalSubmissionsJudged, judgeDoc.snappedJudgedInterim, judgeDoc.snappedJudgedTotal);
	const interimChange = calculateInterimChange(judgedInInterim, judgeDoc.snappedJudgedInterim);
	// TODO maybe refer to judge doc
	return updateOrCreate(
		Auditee,
		{userId: judgeDoc.userId},
		{judgeType: judgeDoc.judgeType, judgedInInterim: judgedInInterim, interimChange: interimChange, totalSubmissionsJudged: totalSubmissionsJudged},
		{userId: judgeDoc.userId, judgeType: judgeDoc.judgeType, judgedInInterim: judgedInInterim, interimChange: interimChange, totalSubmissionsJudged: totalSubmissionsJudged}
	);
}

function calculateTotalSubmissionsJudged(counselledSubmissionIds, totalSubmissionsClosed) {
	return counselledSubmissionIds.length + totalSubmissionsClosed;
}

function calculateJudgedInInterim(totalSubmissionsJudged, snappedJudgedInterim, snappedJudgedTotal) {
	if(snappedJudgedInterim !== undefined) return totalSubmissionsJudged - snappedJudgedTotal; // Conventional flow; not a new judge
	else return totalSubmissionsJudged; // A new judge (or one with 0 snappedJudgedTotal) is one implied to have been created since the last snapshot, so we just take judgedInInterim as their currentJudgedTotal
}

function calculateInterimChange(judgedInInterim, snappedJudgedInterim) {
	if(snappedJudgedInterim !== undefined) {
		if(snappedJudgedInterim !== 0) {
			return -100 + (judgedInInterim / snappedJudgedInterim * 100); // % change (e.g. 4n, 16b = -75%; 28n, 16b = +75%)
		} else {
			if(judgedInInterim === 0) return 0; // 0 judged before, 0 judged now, hence 0
			else return 9999; // ∞ symbol looks too sad so we just say 9999, the max
		}
	} else {
		return 9999;
	}
}

function generateTableRow(index, auditee, auditeeDisplayName) {
	let indexText = generateIndexText(index);
	let displayNameText = generateUserText(auditeeDisplayName, auditee.judgeType)
	let interimText = generateInterimText(auditee.judgedInInterim, auditee.interimChange);
	let totalText = generateTotalText(auditee.totalSubmissionsJudged);

	return `${DIVIDER} ${indexText} ${DIVIDER} ${displayNameText} ${DIVIDER} ${interimText} ${DIVIDER} ${totalText} ${DIVIDER}`;
}

function generateIndexText(index) {
	let placement = index + 1;
	if(placement >= 1000) placement = 999;
	let indexText = TextFormatter.digitiseNumber(placement, 3, placement <= 5 ? index : 6); // If it's >5, it will be coloured the same as the pipe (6: grey) which is appropriate
	return indexText;
}

function generateUserText(displayName, judgeType) {
	const sizedDisplayName = TextFormatter.resizeEnd(displayName, 16, " ", "..");

	let auditeeColorCode = 7;
	if(judgeType === "admin") auditeeColorCode = +process.env.ADMIN_COLOR_CODE;
	else if(judgeType === "nominator") auditeeColorCode = +process.env.NOMINATOR_COLOR_CODE;
	return Coloriser.color(sizedDisplayName, auditeeColorCode);
}

function generateInterimText(judgedInInterim, interimChange) {
	let changeColour;
	let changeSignSymbol;
	if(interimChange >= 0) {
		if(interimChange > 0) {
			changeColour = "GREEN";
			changeSignSymbol = "+";
		} else {
			changeColour = "YELLOW";
			changeSignSymbol = "=";
		}
	} else {
		changeColour = "RED";
		changeSignSymbol = "-";
	}
	const changeText = TextFormatter.digitiseNumber(Math.abs(interimChange), 6, changeColour, changeSignSymbol, "%"); // Absolute value or "--" will happen
	const quantityText = TextFormatter.digitiseNumber(judgedInInterim);
	const hiddenGreyCharacterLength = Coloriser.getColorCharacterLength("GREY") * 4;
	const hiddenColorCharacterLength = Coloriser.getColorCharacterLength("WHITE", changeColour);

	let interimText = quantityText + "  " + Coloriser.color("(", "GREY") + changeText + Coloriser.color(")", "GREY");
	interimText = interimText.padEnd(19 + (hiddenGreyCharacterLength + hiddenColorCharacterLength));
	return interimText;
}

function generateTotalText(currentJudgedTotal) {
	return TextFormatter.digitiseNumber(currentJudgedTotal);
}

const openStatuses = ["AWAITING DECISION", "AWAITING VETO", "PENDING APPROVAL"];
const closedStatuses = ["APPROVED", "REJECTED", "VETOED"];
const tagSizes = [24, 25];
async function generateFormattedTagCounts() {
	let counts = await Promise.all([
		Submission.enqueue(() => Submission.countDocuments({status: {$in: openStatuses}}).exec()),
		Submission.enqueue(() => Submission.countDocuments({status: {$in: closedStatuses}}).exec())
	]);
	for(let i = 0; i < counts.length; i++) {
		counts[i] = TextFormatter.digitiseNumber(counts[i], 5, "WHITE", undefined, undefined, tagSizes[i]);
	}

	return `${DIVIDER} ${counts[0]} ${DIVIDER} ${counts[1]} ${DIVIDER}`; // Using `` to add spaces around the dividers
}
// TODO go through code and replace resizes with appropriate decapitate / abbreviate
const unvetoedStatuses = ["AWAITING VETO", "PENDING APPROVAL"];
const rejectedStatuses = ["REJECTED", "VETOED"];
const subSizes = [10, 11, 11, 11];
async function generateFormattedSubCounts() {
	const counts = await Promise.all([
		Submission.enqueue(() => Submission.countDocuments({status: "AWAITING DECISION"}).exec()),
		Submission.enqueue(() => Submission.countDocuments({status: {$in: unvetoedStatuses}}).exec()),
		Submission.enqueue(() => Submission.countDocuments({status: "APPROVED"}).exec()),
		Submission.enqueue(() => Submission.countDocuments({status: {$in: rejectedStatuses}}).exec())
	]);
	for(let i = 0; i < counts.length; i++) { // Fields are different sizes
		counts[i] = TextFormatter.digitiseNumber(counts[i], 5, "WHITE", undefined, undefined, subSizes[i]);
	}

	return `${DIVIDER} ${counts[0]} ${DIVIDER} ${counts[1]} ${DIVIDER} ${counts[2]} ${DIVIDER} ${counts[3]} ${DIVIDER}`;
}

