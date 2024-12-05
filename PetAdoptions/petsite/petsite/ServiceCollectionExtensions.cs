using Amazon.CloudWatch.EMF.Config;
using Amazon.CloudWatch.EMF.Environment;
using Amazon.CloudWatch.EMF.Logger;
using Amazon.CloudWatch.EMF.Model;
using Microsoft.Extensions.DependencyInjection;

namespace PetSite
{
    public static class ServiceCollectionExtensions
    {
        public static void AddEmf(this IServiceCollection services)
        {
            services.AddScoped<IMetricsLogger, MetricsLogger>();
            services.AddSingleton<IEnvironmentProvider, EnvironmentProvider>();
            services.AddSingleton<IResourceFetcher, ResourceFetcher>();
            services.AddSingleton<IConfiguration>(EnvironmentConfigurationProvider.Config);
        }
    }
}