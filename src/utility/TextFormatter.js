class TextFormatter {
	static resizeFront(text, targetLength, fillerReplacement = " ", excessReplacement = "") {
		if(text.length < targetLength) return text.padStart(targetLength, fillerReplacement);
		if(text.length > targetLength) return decapitate(text, targetLength, excessReplacement);
		return text;
		
	}
	
	static resizeEnd(text, targetLength, fillerReplacement = " ", excessReplacement = "") {
		if(text.length < targetLength) return text.padEnd(targetLength, fillerReplacement);
		if(text.length > targetLength) return abbreviate(text, targetLength, excessReplacement);
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
}

module.exports = TextFormatter;