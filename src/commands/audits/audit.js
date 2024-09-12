require("dotenv").config();

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, time, TimestampStyles } = require("discord.js");

const Info = require("../../mongo/Info");
const Judge = require("../../mongo/Judge");
const getAllThreads = require("../../utility/discord/threads/getAllThreads");
const capitalise = require("../../utility/capitalise");
const Coloriser = require("../../utility/coloriser");

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
		
	// 	const overwrite = interaction.options.getBoolean("overwrite", false) ?? true;
		
	// 	const forums = await Promise.all([
	// 		interaction.client.channels.fetch(process.env.SUBMISSIONS_FORUM_ID),
	// 		interaction.client.channels.fetch(process.env.VETO_FORUM_ID)
	// 	]);

	// 	const forumThreads = await Promise.all(forums.map(forum => getAllThreads(forum)));
	// 	const forumCounts = forumThreads.map(threads => threads.size); // getAllThreads(...) returns a collection

	// 	const snapshotCounts = await Promise.all([
	// 		Info.findOne({id: "snappedSubmissionsCount"}).select({data: 1, _id: 0}).exec(),
	// 		Info.findOne({id: "snappedVetoCount"}).select({data: 1, _id: 0}).exec()
	// 	]);
	// 	const snapshotCreationInfo = await Info.findOne({id: "snapshotCreationTime"}).select({data: 1, _id: 0}).exec();
	// 	const snapshotCreationTime = +snapshotCreationInfo.data;

	// 	let auditString = "**__*AUDIT INFO*__**" +
	// 						"\n" + 
	// 						"_" + 
	// 						time(new Date(snapshotCreationTime), TimestampStyles.LongDate) + 
	// 						" -> " + 
	// 						time(new Date(Date.now()), TimestampStyles.LongDate) +
	// 						"_\n\n";
		
	// 	const judgeDocuments = await Judge.enqueue(() => Judge.find({}));
	// 	for(let i = 0; i < judgeDocuments.length; i++) {
	// 		const user = await interaction.client.users.fetch(judgeDocuments[i].userId);
	// 		const currentJudgedTotal = judgeDocuments[i].counselledSubmissionIds.length + judgeDocuments[i].totalSubmissionsClosed;

	// 		let introString = "`" + capitalise(judgeDocuments[i].judgeType) + "` " + 
	// 						  user.toString() +
	// 						  " judged `" + currentJudgedTotal;

	// 		let performanceString;
	// 		if(judgeDocuments[i].snappedJudgedInterval) { // Conventional flow; not a new judge
	// 			const judgedInInterval = currentJudgedTotal - judgeDocuments[i].snappedJudgedTotal;
	// 			let changeString;
	// 			if(judgeDocuments[i].snappedJudgedInterval != 0) {
	// 				let intervalChange = judgedInInterval / judgeDocuments[i].snappedJudgedInterval * 100;
	// 				intervalChange = Math.round((intervalChange + Number.EPSILON) * 10) / 10; // 1dp
	// 				changeString = " (" + intervalChange + "%" + " " + (intervalChange >= 0 ? intervalChange > 0 ? "⬆️" : "↕️" : "⬇️") + ")";
	// 			} else {
	// 				changeString = " (∞%⬆️)";
	// 			}
				

	// 			performanceString = changeString + " submissions` since last audit";
	// 		} else { // New Judge
	// 			introString = introString.padStart(introString.length + 11, "**_NEW_**  ");
	// 			performanceString = " submissions` since being appointed";
	// 		}
			
	// 		let totalVisibleSubmissions;
	// 		if(judgeDocuments[i].judgeType === "nominator") totalVisibleSubmissions = forumCounts[1];
	// 		else if(judgeDocuments[i].judgeType === "admin") totalVisibleSubmissions = forumCounts.reduce((accumulator, count) => accumulator + count); // Every forum
	// 		else continue; // Unknown type

	// 		auditString += introString + performanceString + ", with `" + totalVisibleSubmissions + " submissions` left to judge in total.\n";
	// 	}

		const auditEmbed = await generateAuditEmbed(interaction.client);

		await deferPromise;
		interaction.editReply({embeds: [auditEmbed]});
	}
}

async function generateAuditEmbed(client) {
	return new EmbedBuilder() // Everything except 
		.setAuthor({name: "TLA Admin Team", iconURL: "https://cdn.discordapp.com/app-icons/1206590967155531856/8e9b1189eab3a2cba17baa92327ac624.png", url: "https://www.youtube.com/@bndh4409"})
		.setTitle("__*JUDGE AUDIT REPORT*__")
		.setFooter({text: "Page 1 of 10", iconURL: "https://images.emojiterra.com/twitter/v14.0/512px/1f4c4.png"})
		.setColor(process.env.AUDIT_COLOR)
		.setDescription(await generateDescriptionText(client));
}

function snapshotJudgeData() {
	
}

async function generateDescriptionText(client) {
	const snapshotCreationInfo = await Info.findOne({id: "snapshotCreationTime"}).select({data: 1, _id: 0}).exec();
	const snapshotCreationTime = +snapshotCreationInfo.data;

	const judgeDocuments = await Judge.enqueue(() => Judge.find({}));

	return generateDateText(snapshotCreationTime) + "\n" +
		   await generateJudgeTableText(judgeDocuments, client);
}

function generateDateText(snapshotCreationTime) {
	const formattedSnapshotTime = time(new Date(snapshotCreationTime), TimestampStyles.LongDate);
	const formattedCurrentTime = time(new Date(Date.now()), TimestampStyles.LongDate);
	return "_" + formattedSnapshotTime + " -> " + formattedCurrentTime + "_";
}

async function generateJudgeTableText(judgeDocuments, client) {
	const colouredTopFrame = Coloriser.color(process.env.AUDIT_FRAME_TOP, "GREY");
	const colouredTagFrame = Coloriser.colorFromMarkers(process.env.AUDIT_FRAME_TAG);
	const colouredMidFrame = Coloriser.color(process.env.AUDIT_FRAME_MID, "GREY");

	let contents = "";
	attachIntervalAndTotalProperties(judgeDocuments);
	const sortedJudgeDocuments = sortJudgeDocuments(judgeDocuments); // Sorts based on judgedInInterval
	for(let i = 0; i < sortedJudgeDocuments.length; i++) {
		attachIntervalChange(sortedJudgeDocuments[i]);
		contents += await generateTableRow(i, sortedJudgeDocuments[i], client) + "\n";
	}

	const colouredBotFrame = Coloriser.color(process.env.AUDIT_FRAME_BOT, "GREY");

	return "```ansi" + "\n" + // Enables colour highlighting
		   colouredTopFrame + "\n" + 
		   colouredTagFrame + "\n" +
		   colouredMidFrame + "\n" +
		   contents + // \n already attached
		   colouredBotFrame +
		   "```";
}

function attachIntervalAndTotalProperties(judgeDocuments) {
	judgeDocuments.forEach(judgeDocument => {
		judgeDocument.currentJudgedTotal = judgeDocument.counselledSubmissionIds.length + judgeDocument.totalSubmissionsClosed; // Used later
		if(judgeDocument.snappedJudgedInterval) judgeDocument.judgedInInterval = judgeDocument.currentJudgedTotal - judgeDocument.snappedJudgedInterval; // Conventional flow; not a new judge
		else judgeDocument.judgedInInterval = judgeDocument.currentJudgedTotal; // A new judge is one implied to have been created since the last snapshot, so we just take judgedInInterval as their currentJudgedTotal
	});
}

function sortJudgeDocuments(judgeDocuments) {
	return judgeDocuments.sort((docA, docB) => docA.judgedInInterval - docB.judgedInInterval);
}

function attachIntervalChange(judgeDocument) { // % change compared to last judgedInInterval value
	if(judgeDocument.snappedJudgedInterval) {
		if(judgeDocument.snappedJudgedInterval != 0) {
			judgeDocument.intervalChange = judgeDocument.judgedInInterval / judgeDocument.snappedJudgedInterval * 100; // %
			judgeDocument.intervalChange = -100 + judgeDocument.intervalChange; // % change (e.g. 4n, 16b = -75%; 28n, 16b = +75%)
			judgeDocument.intervalChange = Math.min(Math.max(judgeDocument.intervalChange, -1000), 1000); // Snap between -1000 and 1000; becomes 999+%
		} else {
			judgeDocument.intervalChange = 1001; // Unique placeholder value: ∞%
		}
	} else {
		judgeDocument.intervalChange = -1001; // Unique placeholder value: N/A%
	}
}

async function generateTableRow(sortedIndex, modifiedJudgeDoc, client) {
	let indexText = resizeEnd(sortedIndex.toString(), 3, " ", "..");
	if(sortedIndex <= 5) indexText = Coloriser.color(indexText, sortedIndex); // If it's >5, it will be coloured the same as the pipe (grey) which is appropriate

	const user = await client.users.fetch(modifiedJudgeDoc.userId);
	let userColorCode = 7;
	if(modifiedJudgeDoc.judgeType === "admin") userColorCode = +process.env.ADMIN_COLOR_CODE;
	else if(modifiedJudgeDoc.judgeType === "nominator") userColorCode = +process.env.NOMINATOR_COLOR_CODE;
	let usernameText = resizeEnd(user.username, 16, " ", "..");
	usernameText = Coloriser.color(usernameText, userColorCode);

	let quantityText;
	if(modifiedJudgeDoc.judgedInInterval >= 1000) quantityText = ">999";
	else quantityText = modifiedJudgeDoc.judgedInInterval.toString();
	quantityText = resizeEnd(quantityText, 4);

	let changeText;
	if(Math.abs(modifiedJudgeDoc.intervalChange) >= 1000) changeText = ">999";
	else changeText = modifiedJudgeDoc.intervalChange.toString();
	changeText = resizeFront(changeText, 4, " ");
	const changeTextColor = modifiedJudgeDoc.intervalChange >= 0 ? modifiedJudgeDoc.intervalChange > 0 ? "GREEN" : "YELLOW" : "RED"; 

	let interimText = quantityText + " (" + changeText + "%)";
	interimText = resizeEnd(interimText, 19);
	interimText = Coloriser.colorIndices(
		interimText, 
		[0, quantityText.length + 2, quantityText.length + 2 + changeText.length + 1], 
		["WHITE", changeTextColor, "WHITE"]
	);
	
	let totalText = modifiedJudgeDoc.currentJudgedTotal.toString();
	if(modifiedJudgeDoc.currentJudgedTotal >= 10000) totalText = "9999+"; // In some insane universe
	totalText = resizeEnd(totalText, 5);
	totalText = Coloriser.color(totalText, "WHITE");

	const divider = Coloriser.color("|", "GREY");
	return `${divider} ${indexText} ${divider} ${usernameText} ${divider} ${interimText} ${divider} ${totalText} ${divider}`;
}

function generateSubmissionTableText() {

}

function generateActionRow() {

}

function resizeFront(text, targetLength, fillerReplacement = " ", excessReplacement = "") {
	if(text.length < targetLength) return text.padStart(targetLength, fillerReplacement);
	if(text.length > targetLength) return decapitate(text, targetLength, excessReplacement);
	return text;
	
}

function resizeEnd(text, targetLength, fillerReplacement = " ", excessReplacement = "") {
	if(text.length < targetLength) return text.padEnd(targetLength, fillerReplacement);
	if(text.length > targetLength) return abbreviate(text, targetLength, excessReplacement);
	return text;
}

function decapitate(text, maxLength, replacement = "..") { // Amusing but sensible
	if(text.length <= maxLength) return text;

	const excess = text.length - maxLength;
	text = text.slice(excess + replacement.length);
	return replacement + text;
}

function abbreviate(text, maxLength, replacement = "..") {
	if(text.length <= maxLength) return text;

	const excess = text.length - maxLength;
	text = text.slice(0, -(excess + replacement.length));
	return text + replacement;
}