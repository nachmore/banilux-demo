using Microsoft.AspNetCore.Mvc;

namespace BaniluxService.Controllers
{
    public class HealthController : Controller
    {
        // GET
        [HttpGet("/health/status")]
        public string Status()
        {
            return "Alive";
        }
    }
}