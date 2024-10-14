const { ButtonBuilder, ActionRowBuilder } = require("discord.js");

module.exports = (actionRow, buttonPredicate, buttonModifier) => {
	const buttons = new Array(actionRow.components.length);
	for(let i = 0; i < actionRow.components.length; i++) {
		const calibratedButtonBuilder = ButtonBuilder.from(actionRow.components[i]);

		if(buttonPredicate(calibratedButtonBuilder)) {
			calibratedButtonBuilder.data.disabled = !buttonModifier(calibratedButtonBuilder);
		}
		buttons[i] = calibratedButtonBuilder;
	}
	return new ActionRowBuilder().setComponents(...buttons);
}