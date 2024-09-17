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
}

// TODO adding prototype methods https://stackoverflow.com/questions/1431094/how-do-i-replace-a-character-at-a-specific-index-in-javascript#:~:text=Javascript%20strings%20are%20immutable%2C%20they,same%20string%20is%20ONE%20object.

module.exports = TextFormatter;