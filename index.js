const axios = require("axios");
const cheerio = require("cheerio");

// Variable to store previously fetched earthquake data
let previousEarthquakes = [];
const centerLat = 14.865228; // Example center latitude
const centerLng = 101.56066; // Example center longitude
const radius = 500; // Radius in kilometers
const LINE_NOTIFY_ACCESS_TOKEN = "hCCDUEMUbYWDWmYln9LubNa6CkmfuGZLCrDoKSsv8zz"; // Replace with your actual LINE Notify access token
const webhook_url =
  "https://prod-56.southeastasia.logic.azure.com:443/workflows/219b5626d2e7482383d6dd5b3869ac66/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=igqDpJebvOAGs9I6vmJeG3TLR-7xL-CGivrKdwuKMdU";
const DOMAIN_NAME = "https://earthquake.tmd.go.th";
let EmojiRedCir = String.fromCodePoint(parseInt(0x0001f534));
function calculateHaversineDistance(centerLat, centerLng, pointLat, pointLng) {
  const earthRadiusKm = 6371; // Earth radius in kilometers

  // Convert latitude and longitude from degrees to radians
  const centerLatRad = toRadians(centerLat);
  const centerLngRad = toRadians(centerLng);
  const pointLatRad = toRadians(pointLat);
  const pointLngRad = toRadians(pointLng);

  // Calculate Haversine distance
  const dLat = pointLatRad - centerLatRad;
  const dLng = pointLngRad - centerLngRad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(centerLatRad) *
      Math.cos(pointLatRad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = earthRadiusKm * c;

  return distance;
}

function isWithinRadius(centerLat, centerLng, pointLat, pointLng, radiusKm) {
  const distance = calculateHaversineDistance(
    centerLat,
    centerLng,
    pointLat,
    pointLng
  );

  // Check if the distance is within the specified radius
  const withinRadius = distance <= radiusKm;

  return { distance, withinRadius };
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

async function getEarthquakeData() {
  try {
    console.log("getEarthquakeData Runing...");
    const url = "https://earthquake.tmd.go.th/inside.html";
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    const earthquakes = []; // Array to store earthquake data

    // Assuming the table has a header row
    const tableRows = $("table").find("tr").slice(1);

    tableRows.each((index, element) => {
      const trElement = $(element);
      const columns = trElement.find("td");
      const earthquake = {};

      // Extract onclick attribute from the tr element
      const onclickValue = trElement.attr("onclick");

      // Use regular expression to extract the value inside window.open
      const match =
        onclickValue && onclickValue.match(/window\.open\('([^']+)'\)/);

      // If there is a match, extract the value
      if (match) {
        const insideInfoValue = match[1];
        earthquake["inside_info_value"] = insideInfoValue;
      }

      columns.each((colIndex, colElement) => {
        const headerText = $("tr").eq(1).find("td").eq(colIndex).text().trim();
        const data = $(colElement).text().trim();

        if (headerText === "วัน-เวลา *ประเทศไทยOrigin Time") {
          earthquake["date_time"] = data;
        }
        if (headerText === "ขนาดMagnitude") {
          earthquake["magnitude"] = data;
        }
        if (headerText === "ลึกDepth") {
          earthquake["depth"] = data;
        }
        if (headerText === "บริเวณศูนย์กลางRegion") {
          earthquake["center"] = data;
        }
        if (headerText === "Latitude") {
          earthquake["lat"] = data;
        }
        if (headerText === "Longitude") {
          earthquake["lng"] = data;
        }
      });

      earthquakes.push(earthquake);
    });
    const slicedEarthquakes = earthquakes.slice(1, earthquakes.length - 2);
    if (previousEarthquakes.length == 0) {
      previousEarthquakes = slicedEarthquakes;
    }
    console.log("getdata success...");
    console.log("slicedEarthquakes", slicedEarthquakes[0]);
    // Check for new events
    const newEvents = slicedEarthquakes.filter(
      (event) =>
        !previousEarthquakes.some(
          (prevEvent) => prevEvent.inside_info_value === event.inside_info_value
        )
    );

    if (newEvents.length > 0) {
      console.log("New earthquake events detected:");
      console.log(newEvents);

      const formattedMessage = newEvents
        .map((item) => {
          const result = isWithinRadius(
            centerLat,
            centerLng,
            parseFloat(item.lat),
            parseFloat(item.lng),
            radius
          );

          return `---\n**📅 Date/Time:** ${item.date_time}  
          **💥 Magnitude:** ${item.magnitude}  
          **📌 Depth:** ${item.depth}  
          **📍 Center:** ${item.center}  
          **🛰 Distance:** ${parseFloat(result.distance).toFixed(1)} KM  
          [🌐 Click for details](${DOMAIN_NAME}/${item.inside_info_value})`;
        })
        .join("\n\n");

      if (formattedMessage.length > 0) {
        console.log("massage", formattedMessage);
        await sendAdaptiveCardToTeams(webhook_url, formattedMessage);
      }
    } else {
      console.log("No new earthquake events.");
    }

    // Update the previous earthquake data for the next comparison
    previousEarthquakes = earthquakes.slice(1, earthquakes.length - 2);
    return earthquakes.slice(1, earthquakes.length - 2);
  } catch (error) {
    console.error(`Error fetching and parsing data: ${error}`);
    //await sendAdaptiveCardToTeams(webhook_url, "Error earthquake fetching");
  }
}
async function sendLineNotification(message) {
  console.log("message", message);
  try {
    const encodedMessage = encodeURIComponent(message);

    await axios.post(
      "https://notify-api.line.me/api/notify",
      `message=${encodedMessage}`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${LINE_NOTIFY_ACCESS_TOKEN}`,
        },
      }
    );
    console.log("Line notification sent successfully.");
  } catch (error) {
    console.error("Error sending Line notification:", error.message);
  }
}
async function sendAdaptiveCardToTeams(webhookUrl, message) {
  const adaptiveCardJson = {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    summary: "🌍 Earthquake Alert 💥",
    themeColor: "FF0000",
    sections: [
      {
        activityTitle: "**🚨 Earthquake Alert**",
        text: message,
        markdown: true,
      },
    ],
  };

  try {
    await axios.post(webhookUrl, adaptiveCardJson);
    console.log("Adaptive card notification sent successfully.");
  } catch (error) {
    console.error(`Failed to send adaptive card: ${error}`);
  }
}
// Set the time interval (in milliseconds) for periodic execution
const interval = 15 * 60 * 1000; // 15 minute
getEarthquakeData();
// Call the function to check for new events periodically
setInterval(() => {
  getEarthquakeData();
}, interval);
