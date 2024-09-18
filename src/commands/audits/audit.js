require("dotenv").config();

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, time, TimestampStyles, ButtonBuilder, ButtonStyle, ActionRow, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js");

const Info = require("../../mongo/Info");
const Judge = require("../../mongo/Judge");
const Submission = require("../../mongo/Submission");
const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const capitalise = require("../../utility/capitalise");
const Coloriser = require("../../utility/Coloriser");
const TextFormatter = require("../../utility/TextFormatter");

const DIVIDER = Coloriser.color("│", "GREY");

// TODO check code considering falsy 0
// TODO consider changing interim resolution to 5 places
module.exports = {
	data: new SlashCommandBuilder()
		.setName("audit")
		.setDescription("Manually perform an audit, displaying the contributions that each judge has made")
		.addBooleanOption(optionBuilder => optionBuilder
			.setName("overwrite")
			.setDescription("Whether or not to overwrite the last system state snapshot. (Default: true).")
			.setRequired(false)
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		const deferPromise = interaction.deferReply();

		const auditEmbed = await generateAuditEmbed(interaction.client);
		const actionRow = generateActionRow();

		await deferPromise;
		interaction.editReply({embeds: [auditEmbed], components: [actionRow]});
	}
}

async function generateAuditEmbed(client) {
	return new EmbedBuilder() // Everything except 
		.setAuthor({name: "TLA Admin Team", iconURL: "https://cdn.discordapp.com/emojis/1198512672585547917.webp?size=96&quality=lossless", url: "https://www.youtube.com/@bndh4409"})
		.setTitle("__*JUDGE AUDIT REPORT*__")
		.setFooter({text: "Page 1 of 10", iconURL: "https://images.emojiterra.com/twitter/v14.0/512px/1f4c4.png"})
		.setColor(process.env.AUDIT_COLOR)
		.setDescription(await generateDescriptionText(client));
}

function generateActionRow() {
	const nextPageButton = new ButtonBuilder()
		.setCustomId("next")
		.setEmoji("➡️")
		.setStyle(ButtonStyle.Secondary);
	const previousPageButton = new ButtonBuilder()
		.setCustomId("previous")
		.setEmoji("⬅️")
		.setStyle(ButtonStyle.Secondary);
	const searchButton = new ButtonBuilder()
		.setCustomId("search")
		.setLabel("Search")
		.setEmoji("🔎")
		.setStyle(ButtonStyle.Success);
	const helpButton = new ButtonBuilder()
		.setCustomId("help")
		.setLabel("Help")
		.setEmoji("❓")
		.setStyle(ButtonStyle.Success);

	return new ActionRowBuilder()
		.setComponents(previousPageButton, searchButton, helpButton, nextPageButton);
}

function snapshotJudgeData() {
	
}

async function generateDescriptionText(client) {
	const descriptionParts = await Promise.all([
		generateDateText(),
		generateJudgeTableBlock(client),
		generateSubmissionTableBlock(),
		generateTotalBlock()
	]);
	const dateText = descriptionParts[0];
	const judgeTableEmbed = descriptionParts[1];
	const submissionTableEmbed = descriptionParts[2];
	const totalEmbed = descriptionParts[3];

	return dateText + "\n\n" +
		   "**" + judgeTableEmbed + "** " +  // Lack of \n packs them close together but still on different lines; space included after the double asterisk or they conflict
		   "**" + submissionTableEmbed + "** " +
		   "**_" + totalEmbed + "_**";
	}

async function generateDateText() {
	const snapshotCreationInfo = await Info.findOne({id: "snapshotCreationTime"}).select({data: 1, _id: 0}).exec();
	const snapshotCreationTime = +snapshotCreationInfo.data;

	const formattedSnapshotTime = time(new Date(snapshotCreationTime), TimestampStyles.LongDate);
	const formattedCurrentTime = time(new Date(Date.now()), TimestampStyles.LongDate);

	return "_" + formattedSnapshotTime + " -> " + formattedCurrentTime + "_";
}

async function generateJudgeTableBlock(client) {
	const judgeDocuments = await Judge.enqueue(() => Judge.find({}));

	const colouredTopFrame = Coloriser.color(process.env.AUDIT_FRAME_TOP, "GREY");
	const colouredTagFrame = Coloriser.colorFromMarkers(process.env.AUDIT_FRAME_TAG);
	const colouredMidFrame = Coloriser.color(process.env.AUDIT_FRAME_MID, "GREY");

	let colouredContents = "";
	attachIntervalAndTotalProperties(judgeDocuments);
	const sortedJudgeDocuments = sortJudgeDocuments(judgeDocuments); // Sorts based on judgedInInterval
	for(let i = 0; i < sortedJudgeDocuments.length; i++) {
		attachIntervalChange(sortedJudgeDocuments[i]);
		colouredContents += await generateTableRow(i, sortedJudgeDocuments[i], client) + "\n";
	}

	const colouredBotFrame = Coloriser.color(process.env.AUDIT_FRAME_BOT, "GREY");

	return "```ansi" + "\n" + // Enables colour highlighting
		   colouredTopFrame + "\n" + 
		   colouredTagFrame + "\n" +
		   colouredMidFrame + "\n" +
		   colouredContents + // \n already attached
		   colouredBotFrame + "```";
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

function attachIntervalAndTotalProperties(judgeDocuments) {
	judgeDocuments.forEach(judgeDoc => {
		judgeDoc.currentJudgedTotal = judgeDoc.counselledSubmissionIds.length + judgeDoc.totalSubmissionsClosed;
		if(judgeDoc.snappedJudgedInterval) judgeDoc.judgedInInterval = judgeDoc.currentJudgedTotal - judgeDoc.snappedJudgedTotal; // Conventional flow; not a new judge
		else judgeDoc.judgedInInterval = judgeDoc.currentJudgedTotal; // A new judge is one implied to have been created since the last snapshot, so we just take judgedInInterval as their currentJudgedTotal
	});
}

function sortJudgeDocuments(judgeDocuments) {
	return judgeDocuments.sort((docA, docB) => docB.judgedInInterval - docA.judgedInInterval);
}

function attachIntervalChange(judgeDoc) { // % change compared to last judgedInInterval value
	if(judgeDoc.snappedJudgedInterval !== undefined) {
		if(judgeDoc.snappedJudgedInterval !== 0) {
			judgeDoc.intervalChange = judgeDoc.judgedInInterval / judgeDoc.snappedJudgedInterval * 100; // %
			judgeDoc.intervalChange = -100 + judgeDoc.intervalChange; // % change (e.g. 4n, 16b = -75%; 28n, 16b = +75%)
			judgeDoc.intervalChange = Math.min(Math.max(judgeDoc.intervalChange, -1000), 1000); // Snap between -1000 and 1000; becomes 999+%
		} else {
			if(judgeDoc.judgedInInterval === 0) judgeDoc.intervalChange = 0; // 0 judged before, 0 judged now, hence 0
			else judgeDoc.intervalChange = 9999; // ∞ symbol looks too sad so we just say 9999, the max
		}
	} else {
		judgeDocument.intervalChange = "???"; // Unique placeholder value: ???%
	}
}

async function generateTableRow(index, modifiedJudgeDoc, client) {
	let indexText = generateIndexText(index);
	let usernameText = await generateUserText(modifiedJudgeDoc, client);
	let interimText = generateInterimText(modifiedJudgeDoc);
	let totalText = generateTotalText(modifiedJudgeDoc);

	return `${DIVIDER} ${indexText} ${DIVIDER} ${usernameText} ${DIVIDER} ${interimText} ${DIVIDER} ${totalText} ${DIVIDER}`;
}

function generateIndexText(index) {
	let placement = index + 1;
	if(placement >= 1000) placement = 999;
	let indexText = TextFormatter.digitiseNumber(placement, 3, placement <= 5 ? index : 6); // If it's >5, it will be coloured the same as the pipe (6: grey) which is appropriate
	return indexText;
}

async function generateUserText(modifiedJudgeDoc, client) {
	const user = await client.users.fetch(modifiedJudgeDoc.userId);
	let userColorCode = 7;
	if(modifiedJudgeDoc.judgeType === "admin") userColorCode = +process.env.ADMIN_COLOR_CODE;
	else if(modifiedJudgeDoc.judgeType === "nominator") userColorCode = +process.env.NOMINATOR_COLOR_CODE;
	let usernameText = TextFormatter.resizeEnd(user.username, 16, " ", "..");
	return Coloriser.color(usernameText, userColorCode);
}

function generateInterimText(modifiedJudgeDoc) {
	let changeColour;
	let changeSignSymbol;
	if(modifiedJudgeDoc.intervalChange >= 0) {
		if(modifiedJudgeDoc.intervalChange > 0) {
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
	const changeText = TextFormatter.digitiseNumber(Math.abs(modifiedJudgeDoc.intervalChange), 6, changeColour, changeSignSymbol, "%"); // Absolute value or "--" will happen
	const quantityText = TextFormatter.digitiseNumber(modifiedJudgeDoc.judgedInInterval);
	const hiddenGreyCharacterLength = Coloriser.getColorCharacterLength("GREY") * 4;
	const hiddenColorCharacterLength = Coloriser.getColorCharacterLength("WHITE", changeColour);

	let interimText = quantityText + "  " + Coloriser.color("(", "GREY") + changeText + Coloriser.color(")", "GREY");
	interimText = interimText.padEnd(19 + (hiddenGreyCharacterLength + hiddenColorCharacterLength));
	return interimText;
}

function generateTotalText(modifiedJudgeDoc) {
	return TextFormatter.digitiseNumber(modifiedJudgeDoc.currentJudgedTotal);
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

