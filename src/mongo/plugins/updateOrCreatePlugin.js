module.exports = function(schema) { // Cannot use arrow functions here
	schema.statics.updateOrCreate = async function(target, alteration, creationDefault = undefined, synced = true) {
		let response;
		if(synced) response = await this.findOneAndUpdate(target, alteration, {new: true}).exec();
		else response = await this.enqueue(() => this.findOneAndUpdate(target, alteration, {new: true}).exec());
		if(response) return response;

		if(!creationDefault) { // Attempt to predict
			Object.keys(alteration).forEach(key => target[key] = alteration[key]);
			creationDefault = target;
		}
		if(synced) return this.enqueue(() => this.create(creationDefault));
		else return this.create(creationDefault);
	}
}; // TODO add enqueue as a pre 