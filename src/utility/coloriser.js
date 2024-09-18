class Coloriser { // TODO americanise all colours
	static Colors = new Map([ // TODO Store externally or interface env variables or enum
		["RED", "\u001b[2;31m"], //    0
		["YELLOW", "\u001b[2;33m"], // 1
		["GREEN", "\u001b[2;32m"], //  2
		["TEAL", "\u001b[2;36m"], //   3
		["BLUE", "\u001b[2;34m"], //   4
		["PINK", "\u001b[2;35m"], //   5
		["GREY", "\u001b[2;30m"], //   6
		["DEFAULT", "\u001b[0m"], //   7
		["WHITE", "\u001b[2;37m"] //   8
	]);

	static color(text, colorCode) {
		if(typeof colorCode === "number") colorCode = this.getKeyFromIndex(this.Colors, colorCode);
		if(!colorCode) return text;

		let colorCharacter = this.Colors.get(colorCode.toUpperCase());
		return colorCharacter + text;
	}
	
	static colorFromMarkers(text) {
		let colouredString = "";
		for(let i = 0; i < text.length; i++) {
			let char = text.charAt(i);
			if(char === "&") {
				const nextChar = text.charAt(i + 1);
				const colorCode = this.getKeyFromIndex(this.Colors, parseInt(nextChar));
				char = this.Colors.get(colorCode);
				i++; // Increment i as the & indicated that the next position referred to a color code, not part of the string proper
			}
			colouredString += char; 
		}
		return colouredString;
	}

	static colorFromIndices(text, indices, colorCodes) { // Indices and colors should be the same length
		let colouredText = "";
		for(let i = 0; i < indices.length; i++) {
			const textSegment = text.substring(indices[i], indices[i + 1]); // The final index + 1 will be undefined, which substring uses to go from start index to end of the string, so it's fine
			colouredText += this.color(textSegment, colorCodes[i]);
		}
		return colouredText;
	}

	static colorArray(textArray, indexTransformer) {
		const colouredArray = [textArray.length];
		for(let i = 0; i < textArray.length; i++) {
			const colorCode = indexTransformer.call(null, i);
			colouredArray[i] = this.color(textArray[i], colorCode);
		}
		return colouredArray;
	}

	static colorFromSequence(textArray, codeSequence) {
		const colouredArray = [textArray.length];
		for(let i = 0; i < textArray.length; i++) {
			colouredArray[i] = this.color(textArray[i], codeSequence[i]);
		}
		return colouredArray;
	}

	static getKeyFromIndex(map, index) {
		return Array.from(map.keys())[index];
	}

	static getColorCharacterLength(...colorCodes) {
		let total = 0;
		for(let colorCode of colorCodes) {
			if(typeof colorCode === "number") colorCode = this.getKeyFromIndex(this.Colors, colorCode);
			if(!colorCode) continue;
			total += this.Colors.get(colorCode).length;
		}
		return total;
	}
}

module.exports = Coloriser;