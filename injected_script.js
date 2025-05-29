// injected_script.js
(function() {
    const originalAlert = window.alert;

    window.alert = function(message) {
        console.log("Pokeking Translator: Intercepted alert (from injected script):", message);
        // Instead of directly showing your custom alert here,
        // we'll use a custom event to communicate back to the content script.
        // This is because the injected script cannot directly access browser.runtime or your custom functions.

        window.dispatchEvent(new CustomEvent('pokekingAlertIntercepted', {
            detail: { message: message }
        }));

        // Optionally call the original alert after a very brief delay,
        // or if you intend for your custom alert to completely replace it,
        // then you wouldn't call originalAlert.
        // For now, let's not call originalAlert to prevent double pop-ups.
        // originalAlert(message); // If you want the native alert to still show after your custom one
    };

    // You might need to override window.prompt as well if the site uses it.
    // const originalPrompt = window.prompt;
    // window.prompt = function(message, defaultValue) {
    //     window.dispatchEvent(new CustomEvent('pokekingPromptIntercepted', {
    //         detail: { message: message, defaultValue: defaultValue }
    //     }));
    //     return null; // Or return originalPrompt(message, defaultValue);
    // };

    console.log("Pokeking Translator: window.alert overridden by injected script.");
})();