module.exports = {
	name	   : "How does \"#layout-veto\" work?",
	definition : ["After going through the **admin screening process**, submissions arrive at #layout-veto.",
				  "Here, **Layout Nominators/Assessors** (**LNs/NATs**) offer their opinion with the **Judgement Reactions** (✅, ⛔).",
				  "Once a submission has reached the **Veto Threshold** (**10 votes**), it enters a **Pending State**.",
				  "After a period of **1 week**, the votes on that submission will be **tallied**.",
				  "The submission will then be **closed**, according to the **vote majority**."],
	example	   :  ["A layout receives **7 approves** and **3 denies** (10 total), and enters the **Pending State**.",
			  	  "After **1 week**, the submission has **11 approves** and **13 denies**.",
				  "The submission is hence **Denied**, as more people voted to deny than to approve."],
	emoji      : "🗃️"
};