module.exports = {
	name	   : "Pending Approval",
	definition : ["A submission enters the **Pending Approval State** once it has reached the **Veto Threshold** (**10 votes**).",
				  "The submission then has **1 week** before the **final verdict** is given.",
				  "This verdict will match whichever **Judgement Reaction** (✅, ⛔) has the **most votes**."],
	example    : ["A layout which had received **7 approves** and **3 denies** (10 total) would enter the **Pending State**.",
				  "It would leave this state after **1 week**, becoming **Closed**."],
	emoji	   : "‼️"
};