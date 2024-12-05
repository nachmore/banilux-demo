using Amazon.CloudWatch.EMF;
using Amazon.CloudWatch.EMF.Config;
using Amazon.CloudWatch.EMF.Environment;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpsPolicy;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Prometheus;

using IConfiguration = Microsoft.Extensions.Configuration.IConfiguration;
using Environments = Amazon.CloudWatch.EMF.Environment.Environments;

namespace PetSite
{
    public class Startup
    {
        private readonly IConfiguration _config;

        public Startup(IConfiguration configuration)
        {
            _config = configuration;
            new ConfigurationBuilder().AddEnvironmentVariables().Build();

            // load the host IP so we can connect to the daemonSet running locally
            var hostIp = Environment.GetEnvironmentVariable("HOST_IP");
            var emfConfig = new Configuration()
            {
                AgentEndPoint = $"tcp://{hostIp}:25888",
                LogGroupName = null
            };

            emfConfig.EnvironmentOverride = Environments.Agent;
            Amazon.CloudWatch.EMF.Config.EnvironmentConfigurationProvider.Config = emfConfig;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddEmf();
            services.AddControllersWithViews();
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            app.UseXRay("PetSite", _config);

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseExceptionHandler("/Home/Error");
                app.UseHsts();
            }

            app.UseHttpsRedirection();
            app.UseStaticFiles();

            app.UseRouting();
            app.UseEmfMiddleware();
            app.UseHttpMetrics();

            app.UseAuthorization();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllerRoute(
                    name: "default",
                    pattern: "{controller=Home}/{action=Index}/{id?}"
                );
                endpoints.MapMetrics();
            });
        }
    }
}