import { createApp } from "./app.js";
import { config } from "./config.js";
import { startWeatherScheduler } from "./modules/weather/weather.scheduler.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`Vineyard Manager API listening on http://localhost:${config.port}`);
  startWeatherScheduler();
});
