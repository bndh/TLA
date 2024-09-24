require("dotenv").config();
const {Client, GatewayIntentBits, Collection, Partials, EmbedBuilder, time, TimestampStyles, ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits} = require("discord.js");
const path = require("path");
const mongoose = require("mongoose");

const Submission = require("./mongo/Submission");

const handleVetoJudgement = require("./utility/discord/submissionsVeto/handleVetoJudgement");
const getAllExports = require("./utility/files/getAllExports");
const { threadId } = require("worker_threads");
const Coloriser = require("./utility/Coloriser");

client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent
	],
	partials: [
		Partials.Channel, // Required to listen for uncached things
		Partials.Message,
		Partials.Reaction
	]
});

(async () => {
	await mongoose.connect(process.env.MONGODB_URI);
	console.log("Connected to Mongoose!");

	pushEmbedMethods();
	loadCommands();
	registerListeners();
	await client.login(process.env.TOKEN);
	await checkChannels();
	startPendingCountdowns();
})();

function pushEmbedMethods() {
	EmbedBuilder.generateResponseEmbed = (author, description, color) => {
		return new EmbedBuilder()
			.setAuthor(author)
			.setDescription(description)
			.setColor(color);
	}

	EmbedBuilder.generateSuccessEmbed = (
		description = "Interaction **successful**!", 
		author = {name: "TLA Admin Team", url: "https://www.youtube.com/@bndh4409", iconURL: process.env.NORMAL_URL}
	) => {
		if(!author.iconURL) author.iconURL = process.env.NORMAL_URL;
		return EmbedBuilder.generateResponseEmbed(author, description, process.env.SUCCESS_COLOR);
	};

	EmbedBuilder.generateNeutralEmbed = (
		description = "Interaction **successful**!", 
		author = {name: "TLA Admin Team", url: "https://www.youtube.com/@bndh4409", iconURL: process.env.HARD_URL}
	) => {
		if(!author.iconURL) author.iconURL = process.env.HARD_URL;
		return EmbedBuilder.generateResponseEmbed(author, description, process.env.NEUTRAL_COLOR);
	};

	EmbedBuilder.generateFailEmbed = (
		description = "Something went **wrong**! Please **try again**.\nIf the issue **persists**, please contact _**@gamingpharoah**_.",
		author = {name: "TLA Admin Team", url: "https://www.youtube.com/@bndh4409", iconURL: process.env.EXTREME_DEMON_URL}
	) => {
		if(!author.iconURL) author.iconURL = process.env.EXTREME_DEMON_URL;
		return EmbedBuilder.generateResponseEmbed(author, description, process.env.FAIL_COLOR);
	};
}

function loadCommands() {
	client.commands = new Collection(); // Attach a commands property to our client which is accessible in other files

	const commands = getAllExports(path.join(__dirname, "commands"), file => !file.name.toLowerCase().endsWith("modules"));
	for(const command of commands) {
		if("data" in command && "execute" in command) {
			client.commands.set(command.data.name, command); // Set a new item in the Collection with key as the command name and value as the command module itself
		} else {
			console.warn(`Command "${command.data.name}" is missing a required "data" or "execute" property.`);
		}
	}
}

function registerListeners() {
	const events = getAllExports(path.join(__dirname, "events"));
	for(const event of events) {
		if(event.once) {
			client.once(event.name, (...args) => event.execute(...args)); // Methods to register event listeners
		} else {
			client.on(event.name, (...args) => event.execute(...args));
		}
		console.info(`Registered: ${event.name}`);
	}
}

async function checkChannels() {
	checkChannel(process.env.SUBMISSIONS_INTAKE_ID, "Intake");
	checkChannel(process.env.SUBMISSIONS_FORUM_ID, "Submissions");
	checkChannel(process.env.VETO_FORUM_ID, "Veto");
}

async function startPendingCountdowns() {
	const pendingThreads = await Submission.enqueue(() => 
		Submission.find({status: "PENDING APPROVAL"})
				  .select({threadId: 1, expirationTime: 1, _id: 0})																
				  .exec()
	);
	if(!pendingThreads) return;

	for(const pendingThread of pendingThreads) {
		const timeout = pendingThread.expirationTime - Date.now().valueOf();
		setTimeout(() => handleVetoJudgement(client, pendingThread.threadId), timeout);
		console.log(`Set timeout for ${pendingThread.threadId} at ${timeout > 0 ? timeout : 0}ms`);
	}
}

async function checkChannel(channelId, channelName) {
	client.channels
		.fetch(channelId)
		.catch(() => console.error(`Channel "${channelName}" ("${channelId}") not found! \nIt is strongly advised to set this .env value and restart.`));
}