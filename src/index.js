require("dotenv").config();
const {Client, GatewayIntentBits, Collection, Partials, EmbedBuilder, time, TimestampStyles, ButtonBuilder, ButtonStyle, ActionRowBuilder} = require("discord.js");
const path = require("path");
const mongoose = require("mongoose");

const Submission = require("./mongo/Submission");

const getAllFilepaths = require("./utility/files/getAllFilepaths");
const getLocalCommands = require("./utility/files/getLocalCommands");
const handleVetoJudgement = require("./utility/discord/submissionsVeto/handleVetoJudgement");
const getUnjudgedThreads = require("./utility/discord/threads/getUnjudgedThreads");
const getAllThreads = require("./utility/discord/threads/getAllThreads");
const hasReacted = require("./utility/discord/reactions/hasReacted");
const capitalise = require("./utility/capitalise");
const color = require("./utility/Coloriser");
const Coloriser = require("./utility/Coloriser");
const TextFormatter = require("./utility/TextFormatter");
const getAllExports = require("./utility/files/getAllExports");

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

	loadCommands();
	loadButtons();
	registerListeners();
	await client.login(process.env.TOKEN);
	await checkChannels();
	startPendingCountdowns();
})();

function loadCommands() {
	client.commands = new Collection(); // Attach a commands property to our client which is accessible in other files

	const commands = getAllExports(path.join(__dirname, "commands"));
	for(const command of commands) {
		if("data" in command && "execute" in command) {
			client.commands.set(command.data.name, command); // Set a new item in the Collection with key as the command name and value as the command module itself
		} else {
			console.warn(`Command "${command.data.name}" is missing a required "data" or "execute" property.`);
		}
	}
}

function loadButtons() {
	client.buttons = new Collection();

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