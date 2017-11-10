# La Carta De Los Verdes #

Cross Platform Mobile Application
Pre-release, version 1

## System Layout ##

### Front end ###
applications are currently being built using Ionic Creator: https://creator.ionic.io/app/dashboard/projects
Most UI code resides and is edited there.

Admin app: https://creator.ionic.io/share/7a2b71e553a8
Customer App: https://creator.ionic.io/share/77a73db30017
Merchant App: https://creator.ionic.io/share/591d737f6dfd

### Back end ###

Back end code is available here in this repository, in the Functions folder under the project root. 
There is also client run code that is hosted here to allow it to be shared between the Ionic Creator apps, look in /www/js

The back end code is put in to service using Google Firebase:  https://console.firebase.google.com/u/0/project/greenscard-177506/overview

### Missing Link ###

This application requires a timer to initiate a batching routine.   This timer is currently being hosted in an Azure Functions app: https://portal.azure.com


### To publish an update ###

Ionic Creator its used to build the mobile application packages for IOS and Android

The web application can be downloaded by exporting the project zip file from Ionic Creator.  Unzip the contents of the merchant
and customer apps to /Merchant/www and /Customer/www respectively. 

When ready to publish the backend, and hosted front end applications, run the prep.bat script in the project root to deploy everything


