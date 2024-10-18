const Coloriser = require("./Coloriser");

class TextFormatter {
	static resizeFront(text, targetLength, fillerReplacement = " ", excessReplacement = "") {
		if(text.length < targetLength) return text.padStart(targetLength, fillerReplacement);
		if(text.length > targetLength) return this.decapitate(text, targetLength, excessReplacement);
		return text;
		
	}
	
	static resizeEnd(text, targetLength, fillerReplacement = " ", excessReplacement = "") {
		if(text.length < targetLength) return text.padEnd(targetLength, fillerReplacement);
		if(text.length > targetLength) return this.abbreviate(text, targetLength, excessReplacement);
		return text;
	}
	
	static decapitate(text, maxLength, replacement = "..") { // Amusing but sensible
		if(text.length <= maxLength) return text;
	
		const excess = text.length - maxLength;
		text = text.slice(excess + replacement.length);
		return replacement + text;
	}
	
	static abbreviate(text, maxLength, replacement = "..") {
		if(text.length <= maxLength) return text;
	
		const excess = text.length - maxLength;
		text = text.slice(0, -(excess + replacement.length));
		return text + replacement;
	}

	static replaceAtCenter(replacement, text) {
		const startIndex = this.findCenteredStartIndex(replacement.length, text.length);
		return this.replaceAt(startIndex, replacement, text);
	}

	static findCenteredStartIndex(textLength, fieldLength) {
		const center = Math.ceil(fieldLength / 2);
		const start = center - Math.ceil(textLength / 2);
		return start;
	}

	static replaceAt(index, replacement, text) {
		return text.substring(0, index) + replacement + text.substring(index + replacement.length);
	}

	static digitiseNumber(number, maxLength = 5, colour = "WHITE", prefix = undefined, suffix = undefined, centerFieldSize = undefined) {
		const cappedNumber = Math.min(
			Math.round(number), 
			parseInt("9".repeat(maxLength))
		);
		
		let formattedNumber = cappedNumber.toString();
		if(prefix) formattedNumber = prefix + formattedNumber;
		if(suffix) formattedNumber = formattedNumber + suffix;
		const properNumberLength = formattedNumber.length; // Used for colouring
	
		const paddedNumber = formattedNumber.padStart(maxLength, "0");
	
		if(!centerFieldSize) {
			return Coloriser.colorFromIndices( // Colours the number in the desired colour while leaving the leading 0's grey
				paddedNumber,
				[0, maxLength - properNumberLength],
				["GREY", colour]
			)
		} else {
			const centerStartIndex = TextFormatter.findCenteredStartIndex(maxLength, centerFieldSize); // Used for colouring
			const centeredNumber = TextFormatter.replaceAt(centerStartIndex, paddedNumber, " ".repeat(centerFieldSize));
		
			return Coloriser.colorFromIndices(
				centeredNumber,
				[0, centerStartIndex + (maxLength - properNumberLength)],
				["GREY", colour]
			);
		}
	}

	static bulletText(text, indentCount = 0) {
		let returnText = "";
		for(let i = 0; i < text.length; i++) {
			const bulletPoint = " ".repeat(indentCount * 2) + "-" // Need two spaces for an indent to count
			returnText += `${i ? "\n" : ""}${bulletPoint} ${text[i]}`;
		}
		return returnText;
	}

	static listItems(textArray) {
		let text = "";
		for(let i = 0; i < textArray.length - 1; i++) {
			text += textArray[i] + ", " 
		}
		text += textArray[textArray.length - 1] ?? "";
		return text;
	}
}

module.exports = TextFormatter;