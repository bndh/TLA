require("dotenv").config();
const {Client, Events, GatewayIntentBits, Collection} = require("discord.js");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const getAllFilePaths = require("./utility/getAllFilePaths");
const getLocalCommands = require("./utility/getLocalCommands");

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent
	]
});

(async () => {
	await connectToDatabase();
	loadCommands();
	registerListeners();
	client.login(process.env.TOKEN);
})();

async function connectToDatabase() {
	await mongoose.connect(process.env.MONGODB_URI);
	console.log("Connected to Database.");
}

function loadCommands() {
	client.commands = new Collection(); // Attach a commands property to our client which is accessible in other files

	for(const command of getLocalCommands(path.join(__dirname, "commands"))) {
		if("data" in command && "execute" in command) {
			client.commands.set(command.data.name, command); // Set a new item in the Collection with key as the command name and value as the command module itself
		} else {
			console.warn(`Command "${command.data.name}" is missing a required "data" or "execute" property.`);
		}
	}
}

function registerListeners() {
	for(const eventFilePath of getAllFilePaths(path.join(__dirname, "events"))) {
		const event = require(eventFilePath);
		if(event.once) {
			client.once(event.name, (...args) => event.execute(...args)); // Methods to register event listeners
		} else {
			client.on(event.name, (...args) => event.execute(...args));
		}
	}
}